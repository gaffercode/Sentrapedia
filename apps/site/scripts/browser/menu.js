function initMenu() {
  const menuToggle = document.querySelector('#mobile-menu-open');
  const mobileMenu = document.querySelector('#mobile-menu');
  if (menuToggle && mobileMenu) {
    const syncMenu = () => menuToggle.setAttribute('aria-expanded', String(document.body.classList.contains('menu-open')));
    new MutationObserver(syncMenu).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Formerly the jQuery theme script (assets/theme/js/custom55e2.js), the only reason the page loaded jQuery.
    menuToggle.addEventListener('click', event => {
      event.preventDefault();
      menuToggle.classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });
    mobileMenu.addEventListener('click', event => {
      if (!event.target.closest('a[href^="#"]')) return;
      document.body.classList.remove('menu-open');
      menuToggle.classList.remove('active');
      syncMenu();
    });
    menuToggle.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.body.classList.remove('menu-open');
      menuToggle.classList.remove('active');
      syncMenu();
    });
  }

  // The desktop header compacts once the page has scrolled past 50 px (main1509.css .header-desk.scrolled).
  const header = document.querySelector('#header');
  if (header) {
    const syncHeader = () => header.classList.toggle('scrolled', window.scrollY > 50);
    window.addEventListener('scroll', syncHeader, { passive: true });
    syncHeader();
  }
}
