(function () {
  function bridge() { return window.__outerSettingsBridge ? window.__outerSettingsBridge : null; }
  function clearIds(root) { var nodes = root.querySelectorAll('[id]'); for (var i = 0; i < nodes.length; i++) nodes[i].removeAttribute('id'); }
  function buildTitles(section) {
    var b = bridge(); if (b == null) return;
    b.renderTitleList();
    var host = section._settingsPersonalSubpage; host.innerHTML = '';
    var source = b.titleListEl; if (source == null) return;
    var clone = source.cloneNode(true); clone.removeAttribute('id');
    var items = clone.querySelectorAll('.title-item');
    for (var i = 0; i < items.length; i++) {
      items[i].disabled = false;
      items[i].classList.remove('is-selected', 'is-locked');
      items[i].classList.add('settings-outer-title-card');
      items[i].removeAttribute('aria-disabled');
    }
    host.appendChild(clone);
    if (b.animateCardBody) b.animateCardBody(host, 0);
  }
  function bindPerformanceRow(row, b) {
    var toggle = row.querySelector('.theme-toggle'); var value = row.querySelector('.theme-value');
    if (toggle == null) return;
    toggle.checked = b.getPerformanceChecked();
    toggle.addEventListener('change', function () { b.setPerformanceChecked(this.checked); value.textContent = this.checked ? '开启' : '关闭'; });
  }
  function bindQualityRow(row, b) {
    var value = row.querySelector('.theme-value'); if (value) value.remove();
    var stepper = row.querySelector('.settings-stepper'); if (stepper) stepper.remove();
    var select = row.querySelector('select');
    if (select) {
      select.removeAttribute('hidden');
      select.value = String(b.getImageQualityLevel());
      select.addEventListener('change', function () { b.setImageQuality(this.value, true); });
    }
  }
  function buildSettings(section) {
    var b = bridge(); if (b == null) return;
    b.applyThemeSettings(98, 0, 0, b.getImageQualityLevel(), true);
    b.applyFont('sarasa', true);
    var host = section._settingsPersonalSubpage; host.innerHTML = '';
    var list = document.createElement('div'); list.className = 'settings-outer-control-list';
    var display = document.querySelector('[data-settings-panel="display"]');
    if (display) {
      var box = display.cloneNode(true); box.hidden = false; clearIds(box);
      var cat = box.querySelector('.quality-category-list'); if (cat) cat.remove();
      var rows = box.querySelectorAll('.theme-control');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.classList.contains('toggle-option')) bindPerformanceRow(row, b);
        else if (row.querySelector('select')) bindQualityRow(row, b);
        else row.remove();
      }
      var remaining = box.querySelectorAll('.theme-control');
      for (var k = 0; k < remaining.length; k++) { remaining[k].classList.add('settings-outer-setting-card'); list.appendChild(remaining[k]); }
    }
    var sponsor = document.querySelector('[data-settings-panel="sponsor"]');
    if (sponsor) {
      var sbox = sponsor.cloneNode(true); clearIds(sbox);
      var buttons = sbox.querySelectorAll('.sponsor-option');
      for (var s = 0; s < buttons.length; s++) {
        buttons[s].classList.add('settings-outer-setting-card');
        (function (button) { button.addEventListener('click', function () { b.showSponsor(button.getAttribute('data-sponsor-image')); }); })(buttons[s]);
        list.appendChild(buttons[s]);
      }
    }
    host.appendChild(list);
    if (b.animateCardBody) b.animateCardBody(host, 0);
  }
  function render(section, view) { if (view === 'titles') buildTitles(section); else buildSettings(section); }
  window.openOuterPersonalSubpage = function (section, view) {
    if (section == null) return; if (section._settingsPersonalSubpage == null) return;
    if (view !== 'titles') { if (view !== 'settings') return; }
    var b = bridge(); if (b == null) return;
    section._outerSettingsPersonalSubpage = view; section._outerSettingsView = 'personal';
    if (section._settingsPersonalActions) section._settingsPersonalActions.hidden = true;
    section._settingsPersonalSubpage.hidden = false;
    render(section, view);
    b.enterSecondary(section, true); b.refreshTopActions();
  };
  window.closeOuterPersonalSubpage = function (section) {
    if (section == null) return; if (section._settingsPersonalSubpage == null) return;
    var b = bridge(); section._outerSettingsPersonalSubpage = '';
    section._settingsPersonalSubpage.hidden = true; section._settingsPersonalSubpage.innerHTML = '';
    if (section._settingsPersonalActions) section._settingsPersonalActions.hidden = false;
    if (b != null) { b.leaveSecondary(section); b.refreshTopActions(); }
  };
  var accountPage = null, accountUser = null, accountPass = null, accountError = null;
  function hideAccountPage() { if (accountPage == null) return; accountPage.hidden = true; document.documentElement.classList.remove('outer-account-page-open'); }
  function buildAccountPage() {
    var b = bridge(); if (b == null) return;
    accountPage = document.createElement('section'); accountPage.className = 'settings-outer-account-page'; accountPage.hidden = true;
    var logout = document.getElementById('accountLogoutTop').cloneNode(true); logout.removeAttribute('id'); logout.className = 'settings-outer-account-logout';
    logout.addEventListener('click', function () { b.logoutInlineAccount(); hideAccountPage(); });
    var form = document.getElementById('accountLoginForm').cloneNode(true); clearIds(form); form.className = 'account-login-card settings-outer-account-card';
    var inputs = form.querySelectorAll('.login-input'); accountUser = inputs[0]; accountPass = inputs[1]; accountError = form.querySelector('.login-error');
    var cancel = form.querySelector('.login-cancel'); if (cancel) cancel.addEventListener('click', function () { hideAccountPage(); });
    form.addEventListener('submit', function (event) { event.preventDefault(); if (b.performLogin(accountUser.value, accountPass.value, accountError)) { accountPass.value = ''; hideAccountPage(); } });
    accountPage.appendChild(logout); accountPage.appendChild(form);
    accountPage.addEventListener('click', function (event) { if (event.target === accountPage) hideAccountPage(); });
    document.body.appendChild(accountPage);
  }
  window.openOuterAccountPage = function () {
    var b = bridge(); if (b == null) return; buildAccountPage();
    var account = b.currentAccountRecord(); var currentUser = b.getUser();
    accountError.textContent = ''; accountPass.value = '';
    accountUser.value = account && account.user ? account.user : (currentUser && currentUser.isAdmin ? 'admin' : '');
    accountPage.hidden = false;
    document.documentElement.classList.add('outer-account-page-open');
    var loginCard = accountPage.querySelector('.settings-outer-account-card');
    if (loginCard) {
      loginCard.classList.remove('is-entering');
      void loginCard.offsetWidth;
      loginCard.classList.add('is-entering');
      setTimeout(function () { loginCard.classList.remove('is-entering'); }, 520);
    }
  };
})();
