const fs = require('node:fs');
const path = require('node:path');

const storageHelper = require('./storageHelper');

let browserSession = null;
let extensions = [];
const loadedExtensionIds = new Set();

const sanitizeForStorage = (extension) => ({
  id: extension.id || null,
  path: extension.path,
  enabled: Boolean(extension.enabled),
  name: extension.name || 'Unknown Extension',
  version: extension.version || '',
  description: extension.description || '',
  lastError: extension.lastError || null,
  installedAt: extension.installedAt || null,
  lastToggledAt: extension.lastToggledAt || null
});

const ensureSession = () => {
  if (!browserSession) {
    throw new Error('Extension session has not been initialized');
  }
};

const persistExtensions = () => {
  storageHelper.saveExtensions(extensions.map(sanitizeForStorage));
};

const extensionDisplayInfo = (extension) => ({
  id: extension.id,
  path: extension.path,
  enabled: Boolean(extension.enabled),
  name: extension.name,
  version: extension.version,
  description: extension.description,
  lastError: extension.lastError || null,
  installedAt: extension.installedAt || null,
  lastToggledAt: extension.lastToggledAt || null,
  isLoaded: extension.id ? loadedExtensionIds.has(extension.id) : false
});

const updateExtensionFromLoaded = (extension, loadedExtension) => {
  extension.id = loadedExtension.id;
  extension.name = loadedExtension.name || extension.name || 'Unknown Extension';
  extension.version = loadedExtension.version || extension.version || '';
  if (loadedExtension.manifest && loadedExtension.manifest.description) {
    extension.description = loadedExtension.manifest.description;
  } else if (!extension.description) {
    extension.description = '';
  }
  extension.enabled = true;
  extension.lastError = null;
  extension.lastToggledAt = Date.now();
  loadedExtensionIds.add(loadedExtension.id);
};

const readManifestMetadata = (extensionPath) => {
  try {
    const manifestPath = path.join(extensionPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        name: manifest.name || 'Unknown Extension',
        version: manifest.version || '',
        description: manifest.description || ''
      };
    }
  } catch (error) {
    console.error('Failed to read extension manifest:', error);
  }
  return {
    name: 'Unknown Extension',
    version: '',
    description: ''
  };
};

const findExtensionById = (extensionId) => {
  return extensions.find((extension) => extension.id === extensionId);
};

const findExtensionByPath = (extensionPath) => {
  return extensions.find((extension) => extension.path === extensionPath);
};

const loadExtensionInternal = async (extensionPath) => {
  ensureSession();
  return browserSession.loadExtension(extensionPath, { allowFileAccess: true });
};

const removeExtensionInternal = async (extensionId) => {
  ensureSession();
  try {
    await browserSession.removeExtension(extensionId);
  } catch (error) {
    // Electron throws if the extension is not loaded; ignore in that case
    if (error && !/does not exist/i.test(error.message || '')) {
      throw error;
    }
  }
  loadedExtensionIds.delete(extensionId);
};

const initialize = async (sessionInstance) => {
  browserSession = sessionInstance;
  const storedExtensions = storageHelper.loadExtensions();
  extensions = Array.isArray(storedExtensions)
    ? storedExtensions.map((stored) => ({
        id: stored.id || null,
        path: stored.path,
        enabled: Boolean(stored.enabled),
        name: stored.name || 'Unknown Extension',
        version: stored.version || '',
        description: stored.description || '',
        lastError: stored.lastError || null,
        installedAt: stored.installedAt || null,
        lastToggledAt: stored.lastToggledAt || null
      }))
    : [];

  let needsPersist = false;

  for (const extension of extensions) {
    if (!extension.path || !fs.existsSync(extension.path)) {
      extension.enabled = false;
      extension.lastError = 'Extension directory not found';
      needsPersist = true;
      continue;
    }

    if (!extension.name || !extension.version) {
      const metadata = readManifestMetadata(extension.path);
      extension.name = metadata.name;
      extension.version = metadata.version;
      extension.description = metadata.description;
      needsPersist = true;
    }

    if (extension.enabled) {
      try {
        const loadedExtension = await loadExtensionInternal(extension.path);
        updateExtensionFromLoaded(extension, loadedExtension);
        if (!extension.installedAt) {
          extension.installedAt = Date.now();
          needsPersist = true;
        }
      } catch (error) {
        console.error(`Failed to load extension at ${extension.path}:`, error);
        extension.enabled = false;
        extension.lastError = error.message || 'Failed to load extension';
        needsPersist = true;
      }
    }
  }

  if (needsPersist) {
    persistExtensions();
  }

  return getExtensions();
};

const getExtensions = () => extensions.map(extensionDisplayInfo);

const installExtension = async (extensionDirectory) => {
  ensureSession();

  if (!extensionDirectory || typeof extensionDirectory !== 'string') {
    throw new Error('A valid extension directory path is required');
  }

  const resolvedPath = path.resolve(extensionDirectory);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error('Extension directory does not exist');
  }

  const manifestPath = path.join(resolvedPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found in the selected directory');
  }

  let loadedExtension;
  try {
    loadedExtension = await loadExtensionInternal(resolvedPath);
  } catch (error) {
    console.error('Failed to install extension:', error);
    throw new Error(error.message || 'Unable to install extension');
  }

  let extension = findExtensionById(loadedExtension.id) || findExtensionByPath(resolvedPath);

  if (extension) {
    // If the extension already exists but has a different id (e.g. re-generated), unload previous id
    if (extension.id && extension.id !== loadedExtension.id) {
      loadedExtensionIds.delete(extension.id);
    }
    updateExtensionFromLoaded(extension, loadedExtension);
  } else {
    extension = {
      id: loadedExtension.id,
      path: resolvedPath,
      enabled: true,
      name: loadedExtension.name || 'Unknown Extension',
      version: loadedExtension.version || '',
      description: loadedExtension.manifest?.description || '',
      lastError: null,
      installedAt: Date.now(),
      lastToggledAt: Date.now()
    };
    extensions.push(extension);
  }

  persistExtensions();
  return extensionDisplayInfo(extension);
};

const enableExtension = async (extensionId) => {
  ensureSession();
  const extension = findExtensionById(extensionId);
  if (!extension) {
    throw new Error('Extension not found');
  }

  if (!extension.path || !fs.existsSync(extension.path)) {
    extension.enabled = false;
    extension.lastError = 'Extension directory not found';
    persistExtensions();
    throw new Error(extension.lastError);
  }

  if (loadedExtensionIds.has(extension.id)) {
    extension.enabled = true;
    extension.lastError = null;
    persistExtensions();
    return extensionDisplayInfo(extension);
  }

  try {
    const loadedExtension = await loadExtensionInternal(extension.path);
    updateExtensionFromLoaded(extension, loadedExtension);
  } catch (error) {
    console.error(`Failed to enable extension ${extensionId}:`, error);
    extension.enabled = false;
    extension.lastError = error.message || 'Failed to enable extension';
    persistExtensions();
    throw new Error(extension.lastError);
  }

  persistExtensions();
  return extensionDisplayInfo(extension);
};

const disableExtension = async (extensionId) => {
  ensureSession();
  const extension = findExtensionById(extensionId);
  if (!extension) {
    throw new Error('Extension not found');
  }

  try {
    if (extension.id) {
      await removeExtensionInternal(extension.id);
    }
    extension.enabled = false;
    extension.lastError = null;
    extension.lastToggledAt = Date.now();
  } catch (error) {
    console.error(`Failed to disable extension ${extensionId}:`, error);
    throw new Error(error.message || 'Failed to disable extension');
  }

  persistExtensions();
  return extensionDisplayInfo(extension);
};

const removeExtension = async (extensionId) => {
  ensureSession();
  const extensionIndex = extensions.findIndex((ext) => ext.id === extensionId);
  if (extensionIndex === -1) {
    throw new Error('Extension not found');
  }

  const extension = extensions[extensionIndex];

  if (extension.id) {
    await removeExtensionInternal(extension.id);
  }

  extensions.splice(extensionIndex, 1);
  persistExtensions();

  return { success: true };
};

module.exports = {
  initialize,
  getExtensions,
  installExtension,
  enableExtension,
  disableExtension,
  removeExtension
};

