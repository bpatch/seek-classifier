(() => {
  let employersList = [];
  const SUFFIX_REGEX = /\b(pty ltd|ltd|inc|incorporated|limited)\b/gi;
  let isToggleInjected = false;
  
  const sanitize = (str) => {
    return str.toLowerCase().replace(SUFFIX_REGEX, '').trim();
  };

  function fuzzyMatch(companyName) {
    if (!companyName) return null;
    const target = sanitize(companyName);
    
    for (const emp of employersList) {
      const src = emp.sanitizedName;
      
      // Exact match after sanitization
      if (src === target) return emp;
      
      // The company name on Seek includes the full name from the spreadsheet (e.g. "Department of Health - Victoria")
      if (target.includes(src) && src.length > 5) return emp;
      
      // The spreadsheet name includes the Seek name (e.g. "Agriculture Victoria" vs "Agriculture Victoria Services Pty Ltd")
      if (src.includes(target) && target.length > 8) return emp;
    }
    return null;
  }

  function processNodes(nodes) {
    nodes.forEach(node => {
      // Only process Element nodes
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      // Seek uses various data-automation attributes for company names
      const selectors = [
        '[data-automation="jobCompany"]',
        '[data-automation="jobAdvertiser"]',
        '[data-automation="jobCardCompanyLink"]',
        '[data-automation="jobCardAdvertiserLink"]',
        '[data-automation="job-company"]',
        '[data-automation="job-advertiser"]',
        '[data-automation="advertiser-name"]',
        '[data-automation="job-detail-advertiser"]',
        '[data-automation="job-detail-company"]',
        // Common classes on careers.vic.gov.au
        '.department', '.agency', '.department-name', '.employer-name', '.rpl-card__subtitle', '.job-department',
        '.rpl-type-p-small' // Generic Ripple typography class used for employer names
      ].join(',');
      
      const companyElements = Array.from(node.querySelectorAll(selectors));
      
      if (node.matches && node.matches(selectors)) {
        companyElements.push(node);
      }

      companyElements.forEach(el => {
        if (el.dataset.seekFlagProcessed) return;
        
        const companyName = el.textContent;
        const matchedEmployer = fuzzyMatch(companyName);
        if (matchedEmployer) {
          const badgeClass = matchedEmployer.type === 'Public Service' 
            ? 'seek-employer-badge-service' 
            : 'seek-employer-badge-sector';
            
          const badge = document.createElement('span');
          badge.className = `seek-employer-badge ${badgeClass}`;
          badge.textContent = `🏛️ ${matchedEmployer.type}`;
          badge.title = 'Matches an organisation in your spreadsheet';
          
          // Insert after the company name element
          el.parentNode.insertBefore(badge, el.nextSibling);
        } else {
          // Only show the unmatched gray badge if we are confident this element is meant to be a company name.
          // We skip generic classes like .rpl-type-p-small to avoid flagging locations and dates as 'Private'.
          const isGenericElement = el.classList.contains('rpl-type-p-small');
          
          if (!isGenericElement) {
            const badge = document.createElement('span');
            badge.className = 'seek-employer-badge seek-employer-badge-unmatch';
            badge.textContent = '🏢 Private / Unlisted';
            badge.title = 'Not found in your spreadsheet';
            
            // Insert after the company name element
            el.parentNode.insertBefore(badge, el.nextSibling);
          }
        }
        
        // Mark as processed regardless of match to avoid re-checking
        el.dataset.seekFlagProcessed = 'true';
      });
    });
  }

  function updateBodyClasses() {
    chrome.storage.local.get(['seekClassifierShowSector', 'seekClassifierShowService'], (result) => {
      const showSector = result.seekClassifierShowSector === true;
      const showService = result.seekClassifierShowService === true;
      
      document.body.classList.remove('seek-classifier-only-sector', 'seek-classifier-only-service', 'seek-classifier-only-both');
      
      if (showSector && !showService) {
        document.body.classList.add('seek-classifier-only-sector');
      } else if (!showSector && showService) {
        document.body.classList.add('seek-classifier-only-service');
      } else if (showSector && showService) {
        document.body.classList.add('seek-classifier-only-both');
      }
    });
  }

  function createToggle(id, labelText, storageKey) {
    const switchLabel = document.createElement('label');
    switchLabel.className = 'seek-classifier-switch';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    
    chrome.storage.local.get([storageKey], (result) => {
      checkbox.checked = result[storageKey] === true;
    });
    
    checkbox.addEventListener('change', (e) => {
      chrome.storage.local.set({ [storageKey]: e.target.checked }, () => {
        updateBodyClasses();
      });
    });
    
    const slider = document.createElement('span');
    slider.className = 'seek-classifier-slider';
    
    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);
    
    const textLabel = document.createElement('span');
    textLabel.className = 'seek-classifier-label';
    textLabel.textContent = labelText;
    
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.marginRight = '16px';
    container.appendChild(switchLabel);
    container.appendChild(textLabel);
    
    return container;
  }

  function injectFilterToggle() {
    if (isToggleInjected) return;
    if (document.getElementById('seek-classifier-toggle-wrapper')) {
      isToggleInjected = true;
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'seek-classifier-toggle-wrapper';
    wrapper.className = 'seek-classifier-toggle-container';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'row';
    wrapper.style.gap = '16px';
    wrapper.style.flexWrap = 'wrap';
    
    // Create toggles
    const sectorToggle = createToggle('seek-toggle-sector', 'Show Public Sector only', 'seekClassifierShowSector');
    const serviceToggle = createToggle('seek-toggle-service', 'Show Public Service only', 'seekClassifierShowService');
    
    wrapper.appendChild(sectorToggle);
    wrapper.appendChild(serviceToggle);
    
    // Initial class application
    updateBodyClasses();
    
    // Try to find native sidebar
    const seekSidebar = document.querySelector('[data-automation="search-filters"] > div, [data-automation="searchPanel"]');
    const vicSidebar = document.querySelector('.views-exposed-form');
    
    if (seekSidebar) {
      seekSidebar.insertBefore(wrapper, seekSidebar.firstChild);
      isToggleInjected = true;
    } else if (vicSidebar) {
      vicSidebar.insertBefore(wrapper, vicSidebar.firstChild);
      isToggleInjected = true;
    } else {
      // Fallback to floating
      wrapper.classList.add('floating');
      document.body.appendChild(wrapper);
      isToggleInjected = true;
    }
  }

  function init() {
    // Try injecting toggle immediately
    injectFilterToggle();

    // Process existing elements on the page
    processNodes([document.body]);

    let pendingNodes = [];
    let frameId = null;

    // Set up a MutationObserver to catch dynamically loaded job cards
    const observer = new MutationObserver((mutations) => {
      if (!isToggleInjected) {
        injectFilterToggle();
      }
      
      // Accumulate all added nodes in this mutation batch
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          pendingNodes.push(...mutation.addedNodes);
        }
      }
      
      // Schedule a single processing run for the accumulated nodes
      if (pendingNodes.length > 0 && !frameId) {
        frameId = requestAnimationFrame(() => {
          const nodesToProcess = pendingNodes;
          pendingNodes = [];
          frameId = null;
          processNodes(nodesToProcess);
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Load the employers data and initialize
  fetch(chrome.runtime.getURL("data/employers.json"))
    .then(response => response.json())
    .then(data => {
      // Pre-compute sanitized names for O(1) loop iteration later
      employersList = data.map(emp => ({
        ...emp,
        sanitizedName: sanitize(emp.name)
      }));
      console.log(`Seek Employer Classifier loaded and pre-processed ${employersList.length} employers.`);
      init();
    })
    .catch(err => console.error("Failed to load employers data:", err));
})();
