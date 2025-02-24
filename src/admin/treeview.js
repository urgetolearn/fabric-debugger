const vscode = require("vscode");
const { NetworkTreeItem } = require("./networkTreeItem");
const { WalletTreeItem } = require("./walletTreeItem");

class TreeViewProvider {
  constructor(type, context) {
    this.type = type;
    this.context = context;
    this.networks = new Map();
    this.wallets = new Map();
    this.networkWalletMap = new Map();
    this.activeNetwork = null;
    this.activeWallet = null;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      if (this.type === "wallets") {
        return Array.from(this.wallets.values());
      } else if (this.type === "fabric-network") {
        return Array.from(this.networks.values());
      } else if (this.type === "network-desc") {
        return this.activeNetwork ? [this.activeNetwork] : [];
      }
    }
    return element.children || [];
  }

  async addWallet(walletData) {
    const walletId = walletData.name || "Unknown Wallet";
    const walletName = walletId;
    const mspId = walletData.mspId || "Unknown MSP";
    const type = walletData.type || "Unknown Type";
    const connectionProfileName = walletData.connectionProfileName || walletId;
    const credentials = walletData.credentials || {};

    let profileItem =
      this.wallets.get(connectionProfileName) ||
      new WalletTreeItem(
        connectionProfileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );

    profileItem.contextValue = "walletItem";

    if (!this.wallets.has(connectionProfileName)) {
      this.wallets.set(connectionProfileName, profileItem);
    }

    const orgItem = new WalletTreeItem(
      walletName,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    orgItem.contextValue = "organization";
    orgItem.parent = profileItem;

    const mspIdItem = new vscode.TreeItem(
      `MSP ID: ${mspId}`,
      vscode.TreeItemCollapsibleState.None
    );

    const typeItem = new vscode.TreeItem(
      `Type: ${type}`,
      vscode.TreeItemCollapsibleState.None
    );

    const certItem = new vscode.TreeItem(
      `Signed Cert: ${
        credentials.certificate ||
        walletData.signedCert ||
        walletData.certificate ||
        "No Certificate Found"
      }`,
      vscode.TreeItemCollapsibleState.None
    );

    const keyItem = new vscode.TreeItem(
      `Private Key: ${
        walletData.adminPrivateKey ||
        walletData.privateKey ||
        credentials.privateKey ||
        "No Private Key Found"
      }`,
      vscode.TreeItemCollapsibleState.None
    );

    orgItem.children = [mspIdItem, typeItem, certItem, keyItem];

    if (!profileItem.children) {
      profileItem.children = [];
    }

    if (!profileItem.children.some((child) => child.label === orgItem.label)) {
      profileItem.children.push(orgItem);
    }

    if (!this.networkWalletMap.has(connectionProfileName)) {
      this.networkWalletMap.set(connectionProfileName, []);
    }

    const walletDetails = this.networkWalletMap.get(connectionProfileName);
    walletDetails.push({
      name: walletName,
      walletId: walletId,
      mspId: mspId,
      certificate: certItem.label.replace("Signed Cert: ", ""),
      privateKey: keyItem.label.replace("Private Key: ", ""),
    });
    this._onDidChangeTreeData.fire();
  }

  addNetwork(data = []) {
    const channelName = data.channelName || "New Network";
    let networkItem =
      this.networks.get(channelName) ||
      new NetworkTreeItem(
        channelName,
        this.type === "fabric-network"
          ? vscode.TreeItemCollapsibleState.None
          : vscode.TreeItemCollapsibleState.Collapsed
      );
    if (!this.networks.has(channelName)) {
      this.networks.set(channelName, networkItem);
    }

    networkItem.children = [];
    const networkDetails = data.networkDetails;
    const walletDetails = data.walletDetails || [];

    if (networkDetails && this.type === "network-desc") {
      this.networkWalletMap.set(channelName, walletDetails);
      this.populateNetworkChildren(networkItem, networkDetails);
    }
    if (!this.activeNetwork) {
      this.setActiveNetwork(networkItem);
    }
    this._onDidChangeTreeData.fire();
  }

  populateNetworkChildren(networkItem, networkDetails) {
    const organizationsItem = new NetworkTreeItem(
      "Organization",
      vscode.TreeItemCollapsibleState.Collapsed
    );
    organizationsItem.children = networkDetails.organizations.map((org) => {
      const orgItem = new NetworkTreeItem(
        org,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      orgItem.children = [
        new NetworkTreeItem(
          `mspid: ${org}-MSP`,
          vscode.TreeItemCollapsibleState.None
        ),
      ];
      return orgItem;
    });
    networkItem.children.push(organizationsItem);

    const peersItem = new NetworkTreeItem(
      "Peers",
      vscode.TreeItemCollapsibleState.Collapsed
    );
    peersItem.children = networkDetails.peers.map(
      (peer) => new NetworkTreeItem(peer, vscode.TreeItemCollapsibleState.None)
    );
    networkItem.children.push(peersItem);

    const orderersItem = new NetworkTreeItem(
      "Orderers",
      vscode.TreeItemCollapsibleState.Collapsed
    );
    orderersItem.children = networkDetails.orderers.map(
      (orderer) =>
        new NetworkTreeItem(orderer, vscode.TreeItemCollapsibleState.None)
    );
    networkItem.children.push(orderersItem);

    const casItem = new NetworkTreeItem(
      "Certificate Authorities",
      vscode.TreeItemCollapsibleState.Collapsed
    );
    casItem.children = networkDetails.cas.map(
      (ca) => new NetworkTreeItem(ca, vscode.TreeItemCollapsibleState.None)
    );
    networkItem.children.push(casItem);
  }

  switchNetwork(connectionProfile) {
    const connectionProfileName = connectionProfile.name;
    const networkItem = this.getNetworkByLabel(connectionProfileName);

    if (!networkItem) {
      console.error(`No network found for label: ${connectionProfileName}`);
      return;
    }

    this.setActiveNetwork(networkItem);

    if (networkItem) {
      this.setActiveNetwork(networkItem);
    } else {
      console.warn(`Network ${connectionProfileName} not found.`);
    }

    const walletDetails =
      this.networkWalletMap.get(connectionProfileName) || [];

    if (walletDetails.length === 0) {
      console.warn(
        `No wallets associated with connection profile ${connectionProfileName}`
      );
      this.setActiveWallet(null);
      return;
    }

    if (walletDetails.length === 1) {
      const walletItem = this.getWalletByLabel(walletDetails[0].name);
      this.setActiveWallet(walletItem);
    } else {
      vscode.window
        .showQuickPick(
          walletDetails.map((w) => w.name),
          { placeHolder: "Select a wallet to switch to" }
        )
        .then((selectedWalletName) => {
          const walletItem = this.getWalletByLabel(selectedWalletName);
          this.setActiveWallet(walletItem);
        });
    }

    this._onDidChangeTreeData.fire();
  }

  deleteWallet(walletId) {
    for (const [profile, wallets] of this.networkWalletMap.entries()) {
      const walletIndex = wallets.findIndex(
        (wallet) => wallet.name === walletId
      );

      if (walletIndex !== -1) {
        wallets.splice(walletIndex, 1);

        const profileItem = this.wallets.get(profile);
        if (profileItem && profileItem.children) {
          const childIndex = profileItem.children.findIndex(
            (child) => child.label === walletId
          );
          if (childIndex !== -1) {
            profileItem.children.splice(childIndex, 1);
          }
        }
        if (
          profileItem &&
          profileItem.children &&
          profileItem.children.length === 0
        ) {
          this.wallets.delete(profile);
        }

        if (wallets.length === 0) {
          this.networkWalletMap.delete(profile);
        }

        this._onDidChangeTreeData.fire();
        vscode.window.showInformationMessage(
          `Wallet ${walletId} deleted successfully.`
        );
        return;
      }
    }
    vscode.window.showWarningMessage(`Wallet ${walletId} does not exist.`);
  }

  deleteNetwork(channelName) {
    if (this.networks.has(channelName)) {
      const walletDetailsList = this.networkWalletMap.get(channelName) || [];

      walletDetailsList.forEach((walletDetails) => {
        const walletId = walletDetails.name;
        this.deleteWallet(walletId);
      });

      this.networkWalletMap.delete(channelName);
      this.networks.delete(channelName);

      if (this.activeNetwork && this.activeNetwork.label === channelName) {
        this.activeNetwork = null;
      }
      this._onDidChangeTreeData.fire();
    } else {
      console.warn(`Network ${channelName} does not exist.`);
    }
  }

  setActiveNetwork(networkItem) {
    if (this.activeNetwork && this.activeNetwork.label === networkItem.label) {
      console.log(`Network "${networkItem.label}" is already active.`);
      return;
    }

    if (this.activeNetwork) {
      this.activeNetwork.setActive(false);
    }

    this.activeNetwork = networkItem;
    this.activeNetwork.setActive(true);

    const connectionProfileName =
      networkItem.connectionProfileName || networkItem.label;
    this.refresh();
  }

  setActiveWallet(walletName) {
    if (!this.wallets || !(this.wallets instanceof Map)) {
      console.error("Wallets collection is not valid:", this.wallets);
      return;
    }

    let foundWallet = null;
    for (const [key, walletItem] of this.wallets.entries()) {
      if (walletItem.label === walletName || walletItem.name === walletName) {
        foundWallet = walletItem;
        break;
      }
    }

    if (!foundWallet) {
      console.warn(`Wallet "${walletName}" not found in WalletTreeItems.`);
      return;
    }

    if (typeof foundWallet.setActive !== "function") {
      console.error(
        "Found wallet does not have a setActive method:",
        foundWallet
      );
      return;
    }

    if (this.activeWallet) {
      this.activeWallet.setActive(false);
    }

    foundWallet.setActive(true);
    this.activeWallet = foundWallet;
    this.refresh();
  }

  getWalletByLabel(walletName) {
    return this.wallets.get(walletName);
  }

  getNetworkByLabel(label) {
    return this.networks.get(label) || null;
  }
}
module.exports = {
  TreeViewProvider,
};
