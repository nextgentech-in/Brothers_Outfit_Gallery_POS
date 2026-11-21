const releasePage = 'https://github.com/nextgentech-in/Brothers_Outfit_Gallery_POS/releases/latest';

function createUpdates({ updater, window, dialog, currentVersion, setMenuLabel, openReleasePage }) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  updater.on('error', error => console.warn('Desktop updater:', error.message));

  let checking;
  let readyVersion;
  let showingDialog = false;
  let stage = 'check';
  let lastProgress = -10;
  updater.on('download-progress', ({ percent }) => {
    if (stage !== 'download' || !Number.isFinite(percent)) return;
    const progress = Math.floor(percent / 10) * 10;
    if (progress > lastProgress) {
      lastProgress = progress;
      setMenuLabel(`Downloading Update (${progress}%)…`);
    }
  });

  function check() {
    if (readyVersion) return Promise.resolve({ version: readyVersion });
    if (!checking) {
      stage = 'check';
      setMenuLabel('Checking for Updates…');
      checking = (async () => {
        const result = await updater.checkForUpdates();
        if (!result) throw new Error('Update feed is unavailable in this installation.');
        if (!result.isUpdateAvailable) return result.updateInfo;
        stage = 'download';
        lastProgress = -10;
        setMenuLabel('Downloading Update…');
        await updater.downloadUpdate();
        readyVersion = result.updateInfo.version;
        return result.updateInfo;
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
      const release = await check();
      if (window.isDestroyed()) return;
      if (!readyVersion) {
        await dialog.showMessageBox(window, {
          type: 'info', title: 'POS Updates', message: 'Brothers Outfit POS is up to date.',
          detail: `Installed version ${currentVersion}. Latest published stable version ${release.version}.`
        });
        return;
      }
      const { response } = await dialog.showMessageBox(window, {
        type: 'info', title: 'POS Updates', message: `Version ${readyVersion} is ready to install.`,
        detail: 'Save or hold any open bill before restarting. Held bills and pending sales stay on this PC.',
        buttons: ['Later', 'Restart and install'], defaultId: 0, cancelId: 0
      });
      if (response === 1) updater.quitAndInstall(false, true);
    } catch (error) {
      if (window.isDestroyed()) return;
      const detail = error?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || error?.code === 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND'
        ? 'The stable release or its update metadata could not be found.'
        : 'Check that this PC can reach GitHub and try again.';
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', title: 'POS Updates',
        message: stage === 'download' ? 'Could not download the POS update.' : 'Could not check for POS updates.',
        detail: `Installed version ${currentVersion}. ${detail}`,
        buttons: ['Close', 'Open release page'], defaultId: 0, cancelId: 0
      });
      if (response === 1) await openReleasePage(releasePage);
    } finally {
      showingDialog = false;
    }
  }

  return { check, checkFromMenu };
}

module.exports = { createUpdates };
