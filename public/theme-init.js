(function () {
  try {
    var saved = localStorage.getItem('instruversal:theme');
    var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    var metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#1A1814' : '#F3ECDD');
    }
  } catch (e) {}
})();
