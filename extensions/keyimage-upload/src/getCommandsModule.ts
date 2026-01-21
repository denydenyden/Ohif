import { Types } from '@ohif/core';
import { getEnabledElement } from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';
import getActiveViewportEnabledElement from '../../cornerstone/src/utils/getActiveViewportEnabledElement';

function getCommandsModule({
  servicesManager,
  commandsManager,
  extensionManager,
}: Types.Extensions.ExtensionParams): Types.Extensions.CommandsModule {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;

  const actions = {
    /**
     * Opens KeyImage editor popup with full OHIF Cornerstone viewport
     */
    openKeyImageEditor: async () => {
      try {
        const activeViewportId = viewportGridService.getActiveViewportId();
        if (!activeViewportId) {
          throw new Error('No active viewport found');
        }

        // Get display sets from active viewport
        const displaySetService = servicesManager.services.displaySetService;
        const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(activeViewportId);
        if (!displaySetUIDs || displaySetUIDs.length === 0) {
          throw new Error('No display sets found in active viewport');
        }

        const displaySets = displaySetUIDs
          .map(uid => displaySetService.getDisplaySetByUID(uid))
          .filter(Boolean);

        if (displaySets.length === 0) {
          throw new Error('Failed to load display sets');
        }

        // Get toolGroupId from active viewport
        const enabledElement = getActiveViewportEnabledElement(viewportGridService);
        let toolGroupId = 'default';
        if (enabledElement) {
          const toolGroup = ToolGroupManager.getToolGroupForViewport(
            enabledElement.viewportId,
            enabledElement.renderingEngineId
          );
          if (toolGroup) {
            toolGroupId = toolGroup.id;
          }
        }

        // Get viewport type from active viewport
        const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
        const viewportType = viewport?.viewportType || 'stack';

        // Get current image index
        let initialImageIndex = 0;
        if (viewport && 'getCurrentImageIdIndex' in viewport) {
          initialImageIndex = viewport.getCurrentImageIdIndex() || 0;
        }

        // Open editor popup
        const { uiModalService } = servicesManager.services;

        const safeHide = () => {
          // Small delay to allow text input dialog to close first
          // This prevents KeyImage modal from closing when text annotation dialog closes
          setTimeout(() => {
            // Check if there's still an active text input dialog
            const textDialogs = document.querySelectorAll('[role="dialog"]');
            const hasTextDialog = Array.from(textDialogs).some(dialog => {
              const hasInput = dialog.querySelector('input, textarea');
              const isKeyImageModal = dialog.querySelector(
                '[data-viewportid="keyimage-editor-viewport"]'
              );
              return hasInput && !isKeyImageModal;
            });

            if (!hasTextDialog) {
              // No text input dialog is open, safe to close KeyImage modal
              uiModalService.hide();
            }
            // Otherwise, don't close - text input dialog is still open
          }, 300);
        };

        uiModalService.show({
          content: KeyImageEditorPopup,
          contentProps: {
            activeViewportId,
            displaySets,
            toolGroupId,
            viewportType,
            initialImageIndex,
            servicesManager,
            commandsManager,
            extensionManager,
            onClose: safeHide,
          },
          containerClassName: 'w-[90vw] h-[90vh] max-w-none max-h-none p-0',
          shouldCloseOnOverlayClick: false, // Prevent closing on outside click
        });
      } catch (error) {
        console.error('[KeyImage] Error opening editor:', error);
        const { uiNotificationService } = servicesManager.services;
        uiNotificationService.show({
          title: 'Error',
          message: error.message || 'Failed to open KeyImage editor',
          type: 'error',
        });
      }
    },
  };

  const definitions = {
    openKeyImageEditor: {
      commandFn: actions.openKeyImageEditor,
      storeContexts: ['VIEWER'],
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'DEFAULT',
  };
}

import KeyImageEditorPopup from './components/KeyImageEditorPopup';

export default getCommandsModule;
