/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  ActiveCellManager,
  AttachmentOpenerRegistry,
  buildChatSidebar,
  AbstractChatModel,
  IAttachment,
  IChatMessage,
  INewMessage,
  SelectionWatcher,
  IChatContext,
  AbstractChatContext
} from '@jupyter/chat';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { UUID } from '@lumino/coreutils';

const welcomeMessage = `
### Welcome to Jupyter Chat!

This is a simple chat panel that allows you to send messages and share files.

The messages are rendered as markdown, allowing you to format the messages with e.g.:
- **bold**
- _italic_
- \`\`\`python
  # This is a code block
  print('Hello world!')
  \`\`\`
- [link](https://jupyter.org)
`;

class ChatContext extends AbstractChatContext {
  get users() {
    return [];
  }
}

class MyChatModel extends AbstractChatModel {
  sendMessage(
    newMessage: INewMessage
  ): Promise<boolean | void> | boolean | void {
    const message: IChatMessage = {
      body: newMessage.body,
      id: newMessage.id ?? UUID.uuid4(),
      type: 'msg',
      time: Date.now() / 1000,
      sender: { username: 'me', mention_name: 'me' },
      attachments: this.input.attachments
    };
    this.messageAdded(message);
    this.input.clearAttachments();
  }

  createChatContext(): IChatContext {
    return new ChatContext({ model: this });
  }
}

/*
 * Extension providing a chat panel.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-chat-example:plugin',
  description: 'The chat panel widget.',
  autoStart: true,
  requires: [IRenderMimeRegistry],
  optional: [
    IDefaultFileBrowser,
    INotebookTracker,
    ISettingRegistry,
    IThemeManager
  ],
  activate: (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    filebrowser: IDefaultFileBrowser | null,
    notebookTracker: INotebookTracker | null,
    settingRegistry: ISettingRegistry | null,
    themeManager: IThemeManager | null
  ): void => {
    // Track the current active cell.
    let activeCellManager: ActiveCellManager | null = null;
    if (notebookTracker) {
      activeCellManager = new ActiveCellManager({
        tracker: notebookTracker,
        shell: app.shell
      });
    }

    // Track the current selection.
    const selectionWatcher = new SelectionWatcher({
      shell: app.shell
    });

    const model = new MyChatModel({
      activeCellManager,
      selectionWatcher,
      documentManager: filebrowser?.model.manager
    });

    // Update the settings when they change.
    function loadSetting(setting: ISettingRegistry.ISettings): void {
      model.config = {
        sendWithShiftEnter: setting.get('sendWithShiftEnter')
          .composite as boolean,
        stackMessages: setting.get('stackMessages').composite as boolean,
        unreadNotifications: setting.get('unreadNotifications')
          .composite as boolean,
        enableCodeToolbar: setting.get('enableCodeToolbar').composite as boolean
      };
    }

    // Init the settings.
    if (settingRegistry) {
      // Wait for the application to be restored and for the settings to be loaded.
      Promise.all([
        app.restored,
        settingRegistry.load('jupyter-chat-example:plugin')
      ])
        .then(([, setting]) => {
          // Read the settings
          loadSetting(setting);

          // Listen for the plugin setting changes
          setting.changed.connect(loadSetting);
        })
        .catch(reason => {
          console.error(
            `Something went wrong when reading the settings.\n${reason}`
          );
        });
    }

    // Create the attachment opener registry.
    const attachmentOpenerRegistry = new AttachmentOpenerRegistry();
    attachmentOpenerRegistry.set('file', (attachment: IAttachment) => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    const panel = buildChatSidebar({
      model,
      rmRegistry,
      themeManager,
      attachmentOpenerRegistry,
      welcomeMessage
    });
    app.shell.add(panel, 'left');
  }
};

export default [plugin];
