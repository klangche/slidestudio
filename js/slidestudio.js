document.addEventListener('DOMContentLoaded', function() {
    // Header elements
    const projectName = document.getElementById('ss-projectName');
    const exportBtn = document.getElementById('ss-exportBtn');
    const themeToggle = document.getElementById('ss-themeToggle');
    const menuToggle = document.getElementById('ss-menuToggle');
    const clearButton = document.getElementById('ss-clearButton');
    const body = document.body;
    
    // About popup elements
    const logoHeader = document.getElementById('ss-logoHeader');
    const aboutPopup = document.getElementById('ss-aboutPopup');
    const aboutClose = document.getElementById('ss-aboutClose');

    const defaultProjectName = 'Project name - Click to edit';
    const MAX_PROJECT_NAME_LENGTH = 50;
    let isProjectNameChanged = false;

    // Auto-detect system theme preference only on initial load
    function detectSystemTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark && !localStorage.getItem('ss-theme')) {
            body.classList.add('ss-dark-mode');
        }
    }

    // Collapsible sections functionality
    const collapsibleHeaders = document.querySelectorAll('.ss-collapsible-header');
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const section = this.parentElement;
            section.classList.toggle('ss-collapsed');
        });
    });

    // About popup functionality
    logoHeader.addEventListener('click', function(e) {
        // Only open the About popup when clicking the logo itself (or its children),
        // not when clicking nearby controls like the theme toggle.
        if (e.target.closest && e.target.closest('.ss-logo')) {
            aboutPopup.style.display = 'flex';
        }
    });

    // Handle clicks on the icon clone in header-right (small screens)
    const headerRight = document.querySelector('.ss-header-right');
    if (headerRight) {
        headerRight.addEventListener('click', function(e) {
            // Check if click is on the ::before pseudo-element area (icon clone)
            // by checking if it's not on the theme toggle button
            if (!e.target.closest('.ss-theme-toggle') && window.innerWidth <= 900) {
                const rect = this.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                // Icon is roughly 28px wide plus 8px margin = first ~36px
                if (clickX < 36) {
                    aboutPopup.style.display = 'flex';
                }
            }
        });
    }

    aboutClose.addEventListener('click', function() {
        aboutPopup.style.display = 'none';
    });

    aboutPopup.addEventListener('click', function(e) {
        if (e.target === aboutPopup) {
            aboutPopup.style.display = 'none';
        }
    });

    // Update clear button visibility
    function updateClearButton() {
        const hasContent = projectName.textContent.trim() !== '' && 
                         projectName.textContent !== defaultProjectName;
        if (hasContent) {
            clearButton.classList.add('ss-visible');
        } else {
            clearButton.classList.remove('ss-visible');
        }
    }


    // Function to truncate text to max length
    function truncateText(text, maxLength) {
        if (text.length > maxLength) {
            return text.substring(0, maxLength);
        }
        return text;
    }

    // Function to edit project name
    projectName.addEventListener('click', function() {
        if (this.textContent === defaultProjectName) {
            this.textContent = '';
            updateClearButton();
        }
    });

    projectName.addEventListener('input', function() {
        if (this.textContent.length > MAX_PROJECT_NAME_LENGTH) {
            this.textContent = truncateText(this.textContent, MAX_PROJECT_NAME_LENGTH);
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(this);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        updateClearButton();
        isProjectNameChanged = this.textContent !== defaultProjectName && this.textContent.trim() !== '';
    });

    projectName.addEventListener('blur', function() {
        if (this.textContent.trim() === '') {
            this.textContent = defaultProjectName;
        } else if (this.textContent !== defaultProjectName) {
            isProjectNameChanged = true;
        }
        updateClearButton();
    });

    projectName.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
        
        if (e.key === 'Enter') {
            e.preventDefault();
        }
        
        if (this.textContent.length >= MAX_PROJECT_NAME_LENGTH && 
            !e.ctrlKey && !e.metaKey && 
            e.key.length === 1 && 
            !e.key.match(/^(Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Tab|Escape)$/)) {
            e.preventDefault();
        }
    });

    projectName.addEventListener('paste', function(e) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
        const truncatedText = truncateText(text, MAX_PROJECT_NAME_LENGTH - this.textContent.length);
        document.execCommand('insertText', false, truncatedText);
        updateClearButton();
    });

    // Clear button functionality
    clearButton.addEventListener('click', function(e) {
        e.stopPropagation();
        projectName.textContent = '';
        projectName.focus();
        isProjectNameChanged = false;
        updateClearButton();
    });

    // Theme toggle functionality
    themeToggle.addEventListener('click', function(e) {
        // Prevent the theme toggle click from bubbling up to the logo container
        // which would open the About popup.
        e.stopPropagation();
        body.classList.toggle('ss-dark-mode');
        localStorage.setItem('ss-theme', body.classList.contains('ss-dark-mode') ? 'dark' : 'light');
    });

    // Menu toggle functionality
    menuToggle.addEventListener('click', function() {
        const isVisible = body.classList.contains('ss-sidebar-visible');
        if (isVisible) {
            body.classList.remove('ss-sidebar-visible');
            body.classList.add('ss-sidebar-hidden');
        } else {
            body.classList.remove('ss-sidebar-hidden');
            body.classList.add('ss-sidebar-visible');
        }
    });

    // Export button functionality
    exportBtn.addEventListener('click', async function() {
        if (this.disabled) return;
        try {
            let name = (projectName.textContent || '').trim() || 'slide_export';
            name = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
            const result = await window.Designer.exportCanvasZip(name + '.zip');
            console.log('Export complete:', result);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed: ' + err.message);
        }
    });

    // Save Template button functionality
    const saveTemplateBtn = document.getElementById('ss-saveTemplateBtn');
    saveTemplateBtn.addEventListener('click', function() {
        alert('Template saved successfully!');
    });

    // Load saved theme preference
    const savedTheme = localStorage.getItem('ss-theme');
    if (savedTheme === 'dark') {
        body.classList.add('ss-dark-mode');
    } else if (savedTheme === 'light') {
        body.classList.remove('ss-dark-mode');
    } else {
        detectSystemTheme();
    }

    // Initialize clear button state
    updateClearButton();
});