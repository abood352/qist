// Sets theme/language before first paint (the site CSP blocks inline scripts, hence a file).
(function () {
  var t = 'light';
  try {
    var s = localStorage.getItem('qist-theme');
    t = s === 'dark' || s === 'light' ? s : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var l = localStorage.getItem('qist-lang');
    if (l === 'en') { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; }
    // the prerendered first screen is the Arabic home page; hide it anywhere else
    var h = location.hash;
    if (l === 'en' || !(h === '' || h === '#' || h === '#/')) document.documentElement.setAttribute('data-noboot', '');
  } catch (e) {}
  document.documentElement.dataset.theme = t;
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#0c1511' : '#f5f7f2');
})();
