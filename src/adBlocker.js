const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class AdBlocker {
  constructor(session) {
    this.session = session;
    this.filterRules = [];
    this.exceptionRules = []; // Whitelist rules (start with @@)
    this.isEnabled = true;
    this.filterCache = new Map();
  }

  // Load filter lists from JSON configuration
  async loadFilterLists(filterListPath) {
    try {
      const filterListData = JSON.parse(fs.readFileSync(filterListPath, 'utf8'));
      const filterLists = filterListData.known_block_lists || [];
      
      console.log(`Loading ${filterLists.length} filter lists...`);
      
      // Load default lists (EasyList, AdGuard, etc.)
      const defaultLists = filterLists.filter(list => 
        list.type === 'generic' || 
        list.type === 'privacy' ||
        list.type === 'cookies'
      );

      // Load all URLs from default lists
      const urlsToLoad = [];
      for (const list of defaultLists) {
        if (list.urls && Array.isArray(list.urls)) {
          for (const url of list.urls) {
            urlsToLoad.push({ url, listId: list.id });
          }
        }
      }

      console.log(`Downloading ${urlsToLoad.length} filter list URLs...`);
      
      // Download and parse filter lists
      const downloadPromises = urlsToLoad.map(({ url, listId }) => 
        this.downloadAndParseFilterList(url, listId).catch(err => {
          console.error(`Failed to load filter list ${listId} from ${url}:`, err.message);
          return { rules: [], exceptions: [] };
        })
      );

      const results = await Promise.all(downloadPromises);
      this.filterRules = results.flatMap(r => r.rules || []).filter(rule => rule !== null);
      this.exceptionRules = results.flatMap(r => r.exceptions || []).filter(rule => rule !== null);
      
      console.log(`Loaded ${this.filterRules.length} filter rules and ${this.exceptionRules.length} exception rules`);
      
      // Setup request blocking
      this.setupRequestBlocking();
      
      return true;
    } catch (error) {
      console.error('Error loading filter lists:', error);
      return false;
    }
  }

  // Download and parse a filter list
  async downloadAndParseFilterList(url, listId) {
    return new Promise((resolve, reject) => {
      // Check cache first
      if (this.filterCache.has(url)) {
        console.log(`Using cached filters for ${listId}`);
        const cached = this.filterCache.get(url);
        const parsed = this.parseFilterList(cached, listId);
        resolve({ rules: parsed.rules || [], exceptions: parsed.exceptions || [] });
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      
      protocol.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Cache the raw filter list
          this.filterCache.set(url, data);
          const parsed = this.parseFilterList(data, listId);
          console.log(`Parsed ${parsed.rules.length} rules and ${parsed.exceptions.length} exceptions from ${listId}`);
          resolve({ rules: parsed.rules, exceptions: parsed.exceptions });
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  // Parse AdBlock Plus/uBlock format filter list
  parseFilterList(data, listId) {
    const rules = [];
    const exceptions = [];
    const lines = data.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines, comments, and metadata
      if (!trimmed || 
          trimmed.startsWith('!') || 
          trimmed.startsWith('#') ||
          trimmed.startsWith('[Adblock')) {
        continue;
      }

      // Handle exception rules (whitelist - start with @@)
      if (trimmed.startsWith('@@')) {
        const exceptionRule = trimmed.substring(2).trim(); // Remove @@ prefix
        // Skip invalid exception rules
        if (!exceptionRule || exceptionRule.length < 3 || exceptionRule.length > 2048) {
          continue;
        }
        const rule = this.parseFilterRule(exceptionRule);
        if (rule) {
          exceptions.push(rule);
        }
        continue;
      }

      // Skip invalid rules (too short or too long)
      if (trimmed.length < 3 || trimmed.length > 2048) {
        continue;
      }

      // Parse common filter patterns
      const rule = this.parseFilterRule(trimmed);
      if (rule) {
        rules.push(rule);
      }
    }

    return { rules, exceptions };
  }

  // Parse a single filter rule into a matchable format
  parseFilterRule(rule) {
    try {
      // Extract options (if any)
      const optionsMatch = rule.match(/\$([^$]+)$/);
      const options = optionsMatch ? optionsMatch[1].split(',') : [];
      const ruleWithoutOptions = optionsMatch ? rule.substring(0, rule.indexOf('$')) : rule;

      // Skip rules with unsupported options
      if (options.some(opt => 
        opt.includes('script') || 
        opt.includes('stylesheet') || 
        opt.includes('xmlhttprequest')
      )) {
        return null; // We'll handle these later if needed
      }

      // Handle domain-specific rules
      if (ruleWithoutOptions.includes('||')) {
        // Domain anchor: ||example.com^ matches http://example.com/path
        const domain = ruleWithoutOptions.replace(/^\|\|/, '').replace(/\^.*$/, '');
        return {
          type: 'domain',
          pattern: domain,
          rule: ruleWithoutOptions
        };
      } else if (ruleWithoutOptions.startsWith('|')) {
        // Start anchor: |https://example.com matches only if URL starts with this
        const startPattern = ruleWithoutOptions.replace(/^\|/, '');
        return {
          type: 'start',
          pattern: startPattern,
          rule: ruleWithoutOptions
        };
      } else if (ruleWithoutOptions.endsWith('|')) {
        // End anchor: example.com| matches only if URL ends with this
        const endPattern = ruleWithoutOptions.replace(/\|$/, '');
        return {
          type: 'end',
          pattern: endPattern,
          rule: ruleWithoutOptions
        };
      } else if (ruleWithoutOptions.includes('^')) {
        // Separator anchor: example^ matches example separated by non-alphanumeric
        const pattern = ruleWithoutOptions.replace(/\^/g, '[^a-zA-Z0-9._%-]*');
        return {
          type: 'regex',
          pattern: this.patternToRegex(pattern),
          rule: ruleWithoutOptions
        };
      } else {
        // Simple substring match
        return {
          type: 'substring',
          pattern: ruleWithoutOptions,
          rule: ruleWithoutOptions
        };
      }
    } catch (error) {
      // Skip malformed rules
      return null;
    }
  }

  // Convert AdBlock pattern to regex
  patternToRegex(pattern) {
    // Escape special regex characters except * and ?
    let regex = pattern
      .replace(/[.+[\]{}()]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    try {
      return new RegExp(regex, 'i');
    } catch (error) {
      return null;
    }
  }

  // Check if a URL matches an exception rule (whitelist)
  matchesException(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      const urlString = url;

      for (const exception of this.exceptionRules) {
        let match = false;

        switch (exception.type) {
          case 'domain':
            if (urlObj.hostname === exception.pattern || 
                urlObj.hostname.endsWith('.' + exception.pattern)) {
              match = true;
            }
            break;

          case 'start':
            if (urlString.startsWith(exception.pattern)) {
              match = true;
            }
            break;

          case 'end':
            if (urlString.endsWith(exception.pattern)) {
              match = true;
            }
            break;

          case 'regex':
            if (exception.pattern && exception.pattern.test(urlString)) {
              match = true;
            }
            break;

          case 'substring':
            if (urlString.includes(exception.pattern)) {
              match = true;
            }
            break;
        }

        if (match) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // If URL parsing fails, do simple substring matching
      for (const exception of this.exceptionRules) {
        if (exception.type === 'substring' && url.includes(exception.pattern)) {
          return true;
        }
      }
      return false;
    }
  }

  // Check if a URL matches any filter rule
  shouldBlock(url) {
    if (!this.isEnabled || !url) {
      return false;
    }

    // Check exception rules first (whitelist takes precedence)
    if (this.matchesException(url)) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const urlString = url;

      for (const filter of this.filterRules) {
        let match = false;

        switch (filter.type) {
          case 'domain':
            // Check if domain matches (with or without subdomain)
            if (urlObj.hostname === filter.pattern || 
                urlObj.hostname.endsWith('.' + filter.pattern)) {
              match = true;
            }
            break;

          case 'start':
            if (urlString.startsWith(filter.pattern)) {
              match = true;
            }
            break;

          case 'end':
            if (urlString.endsWith(filter.pattern)) {
              match = true;
            }
            break;

          case 'regex':
            if (filter.pattern && filter.pattern.test(urlString)) {
              match = true;
            }
            break;

          case 'substring':
            if (urlString.includes(filter.pattern)) {
              match = true;
            }
            break;
        }

        if (match) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // If URL parsing fails, do simple substring matching
      for (const filter of this.filterRules) {
        if (filter.type === 'substring' && url.includes(filter.pattern)) {
          return true;
        }
      }
      return false;
    }
  }

  // Setup Electron webRequest API to block requests
  setupRequestBlocking() {
    if (!this.session) {
      console.error('No session provided for ad blocker');
      return;
    }

    // Block main frame, sub frame, script, stylesheet, image, and other resource requests
    const filter = {
      urls: ['http://*/*', 'https://*/*']
    };

    // Block before request is sent
    this.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      if (!this.isEnabled) {
        callback({});
        return;
      }

      const url = details.url;
      
      // Don't block main frame navigations (user-initiated page loads)
      if (details.resourceType === 'mainFrame') {
        callback({});
        return;
      }

      // Check if URL should be blocked
      if (this.shouldBlock(url)) {
        console.log(`Blocked: ${url.substring(0, 80)}...`);
        callback({ cancel: true });
      } else {
        callback({});
      }
    });

    console.log('Ad blocker request blocking enabled');
  }

  // Enable/disable ad blocker
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`Ad blocker ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Get blocking statistics (optional - for future UI)
  getStats() {
    return {
      rulesLoaded: this.filterRules.length,
      isEnabled: this.isEnabled
    };
  }
}

module.exports = AdBlocker;

