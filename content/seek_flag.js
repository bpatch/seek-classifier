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
    
    // Add "Scan All Pages" button for Careers Vic
    if (window.location.hostname.includes('careers.vic.gov.au')) {
      const scanBtn = document.createElement('button');
      scanBtn.className = 'seek-classifier-scan-btn';
      scanBtn.innerHTML = '🔍 Scan All Pages';
      scanBtn.onclick = startScan;
      wrapper.appendChild(scanBtn);
    }
    
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

  // --- Scan All Pages Feature ---
  let isScanning = false;
  let scanCancelled = false;

  function parseTotalPagesFromHtml(html) {
    const match = html.match(/Displaying \d+ to \d+ of ([\d,]+) results/i);
    if (!match) return 1;
    const totalResults = parseInt(match[1].replace(/,/g, ''), 10);
    return Math.ceil(totalResults / 15);
  }

  function parseJobsFromHtml(html) {
    const jobs = [];
    const cards = html.split('class="job-searchResult"');
    cards.shift();
    
    cards.forEach(cardHtml => {
      const titleMatch = cardHtml.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      const linkMatch = cardHtml.match(/href="(\/job\/[^"]+)"/i);
      const employerMatch = cardHtml.match(/class="rpl-type-p-small[^"]*"[^>]*>([^<]+)<\/p>/i);
      
      if (!titleMatch || !linkMatch || !employerMatch) return;
      
      const title = titleMatch[1].trim();
      const url = new URL(linkMatch[1], window.location.origin).href;
      const employer = employerMatch[1].trim();
      
      let workType = '', salary = '', grade = '';
      
      const detailsBlocks = cardHtml.split('class="job-searchResult-details"');
      detailsBlocks.shift();
      detailsBlocks.forEach(block => {
        const strongMatch = block.match(/<strong>([^<]+)<\/strong>/i);
        if (!strongMatch) return;
        const text = strongMatch[1];
        
        const pMatches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
        if (pMatches.length > 1) {
          const val = pMatches[1][1].replace(/<[^>]+>/g, '').trim();
          if (text.includes('Work Type')) workType = val;
          if (text.includes('Salary')) salary = val;
          if (text.includes('Grade')) grade = val;
        }
      });
      
      jobs.push({ title, url, employer, workType, salary, grade });
    });
    
    return jobs;
  }

  function showProgressOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'seek-classifier-progress-overlay';
    overlay.id = 'seek-classifier-progress-overlay';
    
    overlay.innerHTML = `
      <div class="seek-classifier-progress-box">
        <div class="seek-classifier-progress-text" id="seek-scan-status">Starting scan...</div>
        <div class="seek-classifier-progress-subtext" id="seek-scan-count"></div>
        <div class="seek-classifier-progress-bar-container">
          <div class="seek-classifier-progress-bar" id="seek-scan-bar"></div>
        </div>
        <button class="seek-classifier-cancel-btn" id="seek-scan-cancel">Cancel Scan</button>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('seek-scan-cancel').onclick = () => {
      scanCancelled = true;
      document.getElementById('seek-scan-status').textContent = 'Cancelling...';
    };
  }

  function updateProgress(currentPage, totalPages, foundCount) {
    const percent = Math.round((currentPage / totalPages) * 100);
    document.getElementById('seek-scan-bar').style.width = `${percent}%`;
    document.getElementById('seek-scan-status').textContent = `Scanning page ${currentPage} of ${totalPages}`;
    document.getElementById('seek-scan-count').textContent = `Found ${foundCount} matching jobs so far...`;
  }

  function hideProgressOverlay() {
    const overlay = document.getElementById('seek-classifier-progress-overlay');
    if (overlay) overlay.remove();
  }

  function generateResultsHTML(matchedJobs, showSector, showService) {
    const jobHTML = matchedJobs.map(job => `
      <div class="job-card">
        <h2><a href="${job.url}" target="_blank">${job.title}</a></h2>
        <div class="employer">
          ${job.employer}
          <span class="badge ${job.matchedEmployer.type === 'Public Service' ? 'badge-service' : 'badge-sector'}">
            🏛️ ${job.matchedEmployer.type}
          </span>
        </div>
        <div class="details">
          <span><strong>Work Type:</strong> ${job.workType}</span>
          <span><strong>Salary:</strong> ${job.salary}</span>
          <span><strong>Grade:</strong> ${job.grade}</span>
        </div>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Scan Results - Public Sector Jobs</title>
        <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8f9fa; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
          h1 { color: #1a1a1a; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 30px; }
          .job-card { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .job-card h2 { margin: 0 0 10px 0; font-size: 20px; }
          .job-card a { color: #0056b3; text-decoration: none; }
          .job-card a:hover { text-decoration: underline; }
          .employer { font-size: 16px; color: #555; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
          .details { display: flex; flex-wrap: wrap; gap: 20px; font-size: 14px; color: #666; }
          .details span { background: #f1f3f4; padding: 4px 8px; border-radius: 4px; }
          
          .badge { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: 600; }
          .badge-sector { background-color: #e6f4ea; color: #137333; border: 1px solid #ceead6; }
          .badge-service { background-color: #feefe6; color: #d95d1e; border: 1px solid #f9d8c4; }
          
          .empty-state { text-align: center; padding: 50px; color: #666; font-size: 18px; }
        </style>
      </head>
      <body>
        <h1>Found ${matchedJobs.length} Public Sector/Service Jobs</h1>
        <p style="color: #666; font-size: 14px; margin-top: -20px; margin-bottom: 20px;">
          Active Filters: Sector (${showSector ? 'On' : 'Off'}), Service (${showService ? 'On' : 'Off'})
        </p>
        ${matchedJobs.length > 0 ? jobHTML : '<div class="empty-state">No matching jobs found across all pages.</div>'}
        
        <script>
          window.onload = () => {
            if (${matchedJobs.length} > 0) {
              const duration = 3 * 1000;
              const end = Date.now() + duration;

              (function frame() {
                confetti({
                  particleCount: 5,
                  angle: 60,
                  spread: 55,
                  origin: { x: 0 },
                  colors: ['#137333', '#d95d1e']
                });
                confetti({
                  particleCount: 5,
                  angle: 120,
                  spread: 55,
                  origin: { x: 1 },
                  colors: ['#137333', '#d95d1e']
                });

                if (Date.now() < end) {
                  requestAnimationFrame(frame);
                }
              }());
            }
          };
        </script>
      </body>
      </html>
    `;
  }

  async function startScan() {
    if (isScanning) return;
    isScanning = true;
    scanCancelled = false;
    
    showProgressOverlay();
    
    // Fetch user's current toggle preferences robustly
    const prefs = await chrome.storage.local.get(null);
    const showSector = prefs.seekClassifierShowSector === true || prefs.seekClassifierShowSector === 'true';
    const showService = prefs.seekClassifierShowService === true || prefs.seekClassifierShowService === 'true';
    
    // Determine current search URL without the page parameter
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('page');
    
    let matchedJobs = [];
    let totalPages = 1;
    let currentPage = 0;
    
    try {
      while (currentPage < totalPages && !scanCancelled) {
        currentUrl.searchParams.set('page', currentPage);
        
        const response = await fetch(currentUrl.toString());
        const html = await response.text();
        
        if (currentPage === 0) {
          totalPages = parseTotalPagesFromHtml(html);
        }
        
        const jobsOnPage = parseJobsFromHtml(html);
        
        // Filter jobs
        jobsOnPage.forEach(job => {
          const matchedEmployer = fuzzyMatch(job.employer);
          if (matchedEmployer) {
            let keep = true;
            // Respect toggle filters if any are active
            if (showSector || showService) {
              if (matchedEmployer.type === 'Public Sector' && !showSector) keep = false;
              if (matchedEmployer.type === 'Public Service' && !showService) keep = false;
            }
            if (keep) {
              matchedJobs.push({ ...job, matchedEmployer });
            }
          }
        });
        
        updateProgress(currentPage + 1, totalPages, matchedJobs.length);
        
        currentPage++;
        
        if (currentPage < totalPages && !scanCancelled) {
          // Polite delay of 1.5s between requests
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      
      if (!scanCancelled) {
        // Generate and open results
        const resultsHTML = generateResultsHTML(matchedJobs, showSector, showService);
        const blob = new Blob([resultsHTML], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      }
      
    } catch (err) {
      console.error("Scan failed:", err);
      alert("An error occurred during the scan. Please try again.");
    } finally {
      isScanning = false;
      hideProgressOverlay();
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
