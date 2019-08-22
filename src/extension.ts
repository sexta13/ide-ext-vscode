import * as vscode from 'vscode';
import AuthController from './controllers/AuthController';
import ChallengeController from './controllers/ChallengeController';
import { ChallengeProvider } from './treeDataProviders/ChallengeProvider';
import { HomeProvider } from './treeDataProviders/HomeProvider';
import * as constants from './constants';

// This method is called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('[tcvscodeide] The extension is active.');
  const challengeProvider = new ChallengeProvider(context);
  const homeProvider = new HomeProvider(context);
  vscode.window.registerTreeDataProvider('topcoder-active-contests', challengeProvider);
  vscode.window.registerTreeDataProvider('topcoder-home', homeProvider);

  const authController = new AuthController(context);
  const challengeController = new ChallengeController(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.viewChallengeDetail',
      async (challengeId) =>
        await loginThenAction(context, authController, challengeController.viewChallengeDetails.bind(challengeController, challengeId))
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.viewMarkdown',
      async (path) => {
        const uri = vscode.Uri.file(context.asAbsolutePath(path));
        console.log(uri);
        await vscode.commands.executeCommand<vscode.Location[]>(
          'markdown.showPreview',
          uri,
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.login',
      authController.login.bind(authController)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.logout',
      authController.logout.bind(authController)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.viewOpenChallenges',
      async () =>
        await loginThenAction(context, authController, challengeController.viewOpenChallenges.bind(challengeController))
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.uploadSubmmission',
      async () =>
        await loginThenAction(context, authController, challengeController.uploadSubmmission.bind(challengeController))
    )
  );

}

// This method is called when the extension is deactivated
/* tslint:disable-next-line */
export function deactivate() { }

/**
 * Login first then take action
 * @param context the extension context
 * @param authController the auth controller
 * @param action the action to take
 */
async function loginThenAction(
  context: vscode.ExtensionContext,
  authController: AuthController,
  action: () => Promise<void>
) {
  let token = context.globalState.get(constants.tokenStateKey);
  if (!token) {
    await authController.login();
  }
  token = context.globalState.get(constants.tokenStateKey);
  if (token) {
    await action();
  }
}
