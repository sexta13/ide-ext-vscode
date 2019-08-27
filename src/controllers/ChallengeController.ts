import * as vscode from 'vscode';
import * as _ from 'lodash';
import * as constants from '../constants';
import * as fs from 'fs-extra';
import * as path from 'path';
import ChallengeService from '../services/ChallengeService';
import AuthService from '../services/AuthService';
import * as git from 'isomorphic-git';

/**
 * Controller for handling challenge commands.
 */
export default class ChallengeController {
  private challengeListingsWebviewPanel: vscode.WebviewPanel | undefined = undefined;
  private challengeDetailsWebviewPanel: vscode.WebviewPanel | undefined = undefined;
  private challengeSubmissionWebviewPanel: vscode.WebviewPanel | undefined = undefined;

  constructor(private context: vscode.ExtensionContext) { }

  /**
   * Load all open challenges and display in webview
   */
  public async viewOpenChallenges() {
    if (!this.isUserLoggedIn()) {
      vscode.window.showErrorMessage(constants.notLoggedInMessage);
      return;
    }
    // get challenges list from server
    vscode.window.showInformationMessage(constants.loadingOpenChallengesMessage);
    let newToken;
    let response;
    let challenges;
    try { // handle errors while retrieving information from the server
      newToken = await AuthService.updateTokenGlobalState(this.context);
      response = await ChallengeService.getActiveChallenges(newToken);
      challenges = _.get(response, 'result.content', []);
    } catch (err) {
      vscode.window.showErrorMessage(err.message);
      return;
    }

    try {// handle any other errors while generating the html or preparing the webview
      // ensure webview is available, then set content into it
      this.makeChallengeListingsWebViewAvailable();
      this.setChallengeListingsContent(challenges);
      vscode.window.showInformationMessage(constants.openChallengesLoadedMessage);
    } catch (err) {
      vscode.window.showErrorMessage(constants.loadOpenChallengesFailedMessage);
    }
  }

  /**
   * Submit the current workspace to topcoder challenge
   */
  public async uploadSubmmission() {
    if (!this.isUserLoggedIn()) {
      vscode.window.showErrorMessage(constants.notLoggedInMessage);
      return;
    }
    vscode.window.showInformationMessage(constants.submittingChallenges);

    try {
      const newToken = await AuthService.updateTokenGlobalState(this.context);
      const workspacePath = vscode.workspace.rootPath || '';
      const response = await ChallengeService.uploadSubmmission(newToken, workspacePath);
      console.log('Submit challenge response: ' + JSON.stringify(response));
    } catch (err) {
      console.log(`Error occur when submit challenge (${err.toString()})`);
      vscode.window.showErrorMessage(err.toString());
      return;
    }
    vscode.window.showInformationMessage(constants.challengeSubmittedMessage);
  }

  /**
   * Loads the active challenges of the currently logged in user.
   */
  public async loadChallengesOfLoggedInUser() {// errors are handled by the caller
    const token = await AuthService.updateTokenGlobalState(this.context);
    return await ChallengeService.getActiveChallengesOfUser(token);
  }

  /**
   * Loads the active submissions of the currently logged in user.
   */
  public async loadActiveSubmissions() {
    const challenges = await this.loadChallengesOfLoggedInUser();
    return challenges.filter((t: any) => t.userDetails.hasUserSubmittedForReview)
      .map((ch: any) => ({ id: ch.id, name: ch.name }));
  }

  public async loadUserSubmission(challengeId: string) {
    let reviews;
    try {
      vscode.window.showInformationMessage(constants.loadSubmissionStarted);
      const token = await AuthService.updateTokenGlobalState(this.context);
      const result = await ChallengeService.getSubmissionDetails(challengeId, token);
      console.log('result', result);
      reviews = await Promise.all(result.map(async (sub: any) => {
        const artifactsResult = await ChallengeService.getSubmissionArtifacts(sub.id, token);
        const artifacts = _.get(artifactsResult, 'artifacts', []);
        console.log('artifacts', artifacts);
        return { artifacts, id: sub.id, score: sub.review[0].score, created: sub.review[0].created };
      }));
      console.log('reviews', reviews);
    } catch (err) {
      vscode.window.showErrorMessage(constants.loadSubmissionFailed);
    }

    try { // handle any other errors while generating the html
      // ensure webview is available and then set content
      this.makeChallengeUserSubmissionDetailsWebViewAvailable();
      this.setSubmissionsContent(reviews);
      vscode.window.showInformationMessage(constants.loadSubmissionSuccess);
    } catch (err) {
      vscode.window.showErrorMessage(constants.challengeDetailsLoadFailedMessage);
    }
  }

  /**
   * Load challenge details for the given challenge id.
   * @param challengeId The challenge Id
   */
  public async viewChallengeDetails(challengeId: string) {
    if (!this.isUserLoggedIn()) {
      vscode.window.showErrorMessage(constants.notLoggedInMessage);
      return;
    }

    // get challenge details
    vscode.window.showInformationMessage(constants.loadingChallengeDetails);
    let challengeDetails;
    let token;
    try { // handle errors while retreiving information from the server
      token = await AuthService.updateTokenGlobalState(this.context);
      const apiResponse = await ChallengeService.getChallengeDetails(challengeId, token);
      challengeDetails = _.get(apiResponse, 'result.content', {});
    } catch (err) {
      console.log(`Error occur when loading challenge details (${err.toString()})`);
      vscode.window.showErrorMessage(err.toString());
      return;
    }

    try { // handle any other errors while generating the html
      // ensure webview is available and then set content
      this.makeChallengeDetailsWebViewAvailable();
      this.setChallengeDetailsWebViewContent(challengeDetails, token);
      vscode.window.showInformationMessage(constants.challengeDetailsLoadedMessage);
    } catch (err) {
      vscode.window.showErrorMessage(constants.challengeDetailsLoadFailedMessage);
    }
  }

  /**
   * Check if user has logged in.
   */
  private isUserLoggedIn(): boolean {
    const token = this.context.globalState.get(constants.tokenStateKey);
    return !!token;
  }

  /**
   * Returns a new webview panel.
   * @param title The title of the webview panel
   * @param allowScripts Defaults to false. Set true to enable javascript inside the webview.
   */
  private getNewWebViewPanel(title: string, allowScripts = false): vscode.WebviewPanel {
    const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    // create a new panel
    const webviewPanel: vscode.WebviewPanel | undefined = vscode.window.createWebviewPanel(
      constants.scheme,
      title,
      columnToShowIn || vscode.ViewColumn.One,
      {
        enableScripts: allowScripts
      }
    );
    return webviewPanel;
  }

  /**
   * Handle messages from the challenges page.
   * @param message The message from the webview of the format {action, data}
   */
  private handleMessagesFromWebView = async (message: any) => {
    switch (message.action) {
      case constants.webviewMessageActions.DISPLAY_CHALLENGE_DETAILS: {
        await this.viewChallengeDetails(message.data.challengeId);
        break;
      }
      case constants.webviewMessageActions.REGISTER_FOR_CHALLENGE: {
        await this.registerUserForChallenge(message.data.challengeId);
        break;
      }
      case constants.webviewMessageActions.INITIALIZE_WORKSPACE: {
        await this.initializeWorkspaceForChallenge(message.data.challengeId);
        break;
      }
      case constants.webviewMessageActions.CLONE_STARTER_PACK: {
        await this.showCloneStarterPack(message.data.filter);
        break;
      }
    }
  }

  /**
   * Show starter packs. This way a user can pick one, and clone a starter pack project
   * @param filteredTechs object containing the techs that exist in the challenge
   */
  private async showCloneStarterPack(filteredTechs: any) {
    // get all the repos that exist in configuration
    const repos = _.flatten(filteredTechs.map((f: any) => f.repos.map((repo: any) => repo)));
    const choice = await vscode.window.showQuickPick(
      repos.map((r: any) => r.title),
      {
        canPickMany: false,
        placeHolder: 'Choose a starter pack'
      }
    );
    // get the url for the selected repo
    const selection = repos.find((t: any) => t.title === choice) as any;
    try {
      vscode.window.showInformationMessage(constants.cloningStarterPackStarted);
      git.plugins.set('fs', fs);
      // clone it to root
      await git.clone({
        dir: vscode.workspace.rootPath || '',
        url: selection.url,
        singleBranch: true,
      });
      // removing the git folder, since no need to get attached to that repository
      fs.removeSync(path.join(vscode.workspace.rootPath || '', '.git'));
      vscode.window.showInformationMessage(constants.cloningStarterPackSuccess);
    } catch (err) {
      vscode.window.showErrorMessage(constants.errorCloningStarterPack);
    }
  }

  /**
   * Ensure that a valid and undisposed webview is available to load challenge listings
   */
  private makeChallengeListingsWebViewAvailable() {
    const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    if (this.challengeListingsWebviewPanel) {
      this.challengeListingsWebviewPanel.reveal(columnToShowIn);
    } else {
      this.challengeListingsWebviewPanel = this.getNewWebViewPanel(constants.challengesPageTitle, true);
      // handle dispose of webview
      this.challengeListingsWebviewPanel.onDidDispose(
        () => {
          this.challengeListingsWebviewPanel = undefined;
        },
        null,
        this.context.subscriptions
      );

      // listen for messages from webview
      this.challengeListingsWebviewPanel.webview.onDidReceiveMessage(
        this.handleMessagesFromWebView,
        undefined,
        this.context.subscriptions
      );
    }
  }
  /**
   * Ensure that a valid and undisposed webview is available to load submission details
   */
  private makeChallengeUserSubmissionDetailsWebViewAvailable() {
    const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    if (this.challengeSubmissionWebviewPanel) {
      this.challengeSubmissionWebviewPanel.reveal(columnToShowIn);
    } else {
      this.challengeSubmissionWebviewPanel = this.getNewWebViewPanel(constants.submissionDetailsPageTitle, true);
      // handle dispose of webview
      this.challengeSubmissionWebviewPanel.onDidDispose(
        () => {
          this.challengeSubmissionWebviewPanel = undefined;
        },
        null,
        this.context.subscriptions
      );
    }
  }

  /**
   * Make sure that a valid and undisposed webview is available to show challenge details
   */
  private makeChallengeDetailsWebViewAvailable() {
    const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    if (this.challengeDetailsWebviewPanel) {
      this.challengeDetailsWebviewPanel.reveal(columnToShowIn);
    } else {
      this.challengeDetailsWebviewPanel = this.getNewWebViewPanel(constants.challengeDetailsPageTitle, true);
      // handle webview dispose
      this.challengeDetailsWebviewPanel.onDidDispose(
        () => {
          this.challengeDetailsWebviewPanel = undefined;
        },
        null,
        this.context.subscriptions
      );
      // listen for messages from webview
      this.challengeDetailsWebviewPanel.webview.onDidReceiveMessage(
        this.handleMessagesFromWebView,
        undefined,
        this.context.subscriptions
      );
    }
  }

  /**
   * Set the content of the webview using the available challenges information
   * @param challenges The challenges collection
   */
  private setChallengeListingsContent(challenges: any) {
    if (this.challengeListingsWebviewPanel) {
      this.challengeListingsWebviewPanel.webview.html = ChallengeService.generateHtmlFromChallenges(challenges);
    }
  }

  /**
   * Set the content of the webview using the available submssion information
   * @param challenges The submission details
   */
  private setSubmissionsContent(reviews: any) {
    if (this.challengeSubmissionWebviewPanel) {
      this.challengeSubmissionWebviewPanel.webview.html = ChallengeService.generateReviewArtifactsHtml(reviews);
    }
  }

  /**
   * Set the content of the webview using the available details of a challenge
   * @param challengeDetails The details of a challenge
   */
  private setChallengeDetailsWebViewContent(challengeDetails: any, token: string) {
    if (this.challengeDetailsWebviewPanel && challengeDetails) {
      this.challengeDetailsWebviewPanel
        .webview.html = ChallengeService.generateHtmlFromChallengeDetails(challengeDetails, token);
    }
  }

  /**
   * Attempt to register the person to the challenge selected
   * @param challengeId The challenge id to register to
   */
  private async registerUserForChallenge(challengeId: string) {
    vscode.window.showInformationMessage(constants.registeringMessage);
    try {
      const userToken = await AuthService.updateTokenGlobalState(this.context);
      const { data } = await ChallengeService.registerUserForChallenge(challengeId, userToken);
      const status = _.get(data, 'result.status', 500);
      if (status === 200) {
        vscode.window.showInformationMessage(constants.registeredSuccessfullyMessage);
        if (this.challengeDetailsWebviewPanel !== undefined) {
          this.challengeDetailsWebviewPanel.webview.postMessage(
            {
              command: constants.webviewMessageActions.REGISTERED_FOR_CHALLENGE
            }
          );
        }
      } else {
        vscode.window.showErrorMessage(_.get(data, 'result.content', constants.registrationFailedMessage));
      }
    } catch (err) {
      vscode.window.showErrorMessage(err.toString());
    }
  }

  /**
   * Initialize the current workspace for the registered challenge
   * @param challengeId The challenge id to initiazlie with
   */
  private async initializeWorkspaceForChallenge(challengeId: string) {
    vscode.window.showInformationMessage(constants.initializingWorkspaceMessage);
    try {
      await ChallengeService.initializeWorkspace(vscode.workspace.rootPath || '', challengeId);
      vscode.window.showInformationMessage(constants.workspaceInitializationSuccessMessage);
    } catch (err) {
      vscode.window.showErrorMessage(constants.workspaceInitializationFailedMessage);
    }
  }
}
