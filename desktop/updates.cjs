function createUpdates({ updater, window, dialog, currentVersion, setMenuLabel }) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  updater.on('error', error => console.warn('Desktop updater:', error.message));

  let checking;
  let readyVersion;
  let showingDialog = false;

  function check() {
    if (readyVersion) return Promise.resolve(readyVersion);
    if (!checking) {
      setMenuLabel('Checking for Updates…');
      checking = (async () => {
        const result = await updater.checkForUpdates();
        if (!result?.isUpdateAvailable) return null;
        setMenuLabel('Downloading Update…');
        await updater.downloadUpdate();
        readyVersion = result.updateInfo.version;
        return readyVersion;
      })().finally(() => {
        checking = undefined;
        setMenuLabel(readyVersion ? `Restart to Install ${readyVersion}…` : 'Check for Updates…');
      });
    }
    return checking;
  }

  async function checkFromMenu() {
    if (showingDialog) return;
    showingDialog = true;
    try {
      const version = await check();
      if (window.isDestroyed()) return;
      if (!version) {
        await dialog.showMessageBox(window, {
          type: 'info', title: 'POS Updates', message: 'Brothers Outfit POS is up to date.',
          detail: `Installed version ${currentVersion}`
        });
        return;
      }
      const { response } = await dialog.showMessageBox(window, {
        type: 'info', title: 'POS Updates', message: `Version ${version} is ready to install.`,
        detail: 'Save or hold any open bill before restarting. Held bills and pending sales stay on this PC.',
        buttons: ['Later', 'Restart and install'], defaultId: 0, cancelId: 0
      });
      if (response === 1) updater.quitAndInstall(false, true);
    } catch {
      if (!window.isDestroyed()) await dialog.showMessageBox(window, {
        type: 'warning', title: 'POS Updates', message: 'The update could not be downloaded.',
        detail: 'Check your internet connection and try Updates again.'
      });
    } finally {
      showingDialog = false;
    }
  }

  return { check, checkFromMenu };
}

module.exports = { createUpdates };
