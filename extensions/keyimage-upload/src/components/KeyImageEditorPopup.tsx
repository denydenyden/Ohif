import React, { useEffect, useRef, Suspense, useState, useCallback } from 'react';
import { getEnabledElement, StackViewport } from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';
import { ToolButton } from '@ohif/ui-next';
import ToolButtonListWrapper from '@ohif/extension-default/src/Toolbar/ToolButtonListWrapper';
import { useToolbar } from '@ohif/core/src/hooks/useToolbar';
import type { Types } from '@ohif/core';

// Lazy load OHIFCornerstoneViewport component
// Import the component directly - it's exported as default from the Viewport file
const OHIFCornerstoneViewportComponent = React.lazy(() =>
  import('../../../cornerstone/src/Viewport/OHIFCornerstoneViewport').then(module => ({
    default: module.default,
  }))
) as any;

const POPUP_VIEWPORT_ID = 'keyimage-editor-viewport';

interface KeyImageEditorPopupProps {
  activeViewportId: string;
  displaySets: any[];
  toolGroupId: string;
  viewportType: string;
  initialImageIndex: number;
  servicesManager: any;
  commandsManager: any;
  onClose: () => void;
}

const KeyImageEditorPopup: React.FC<KeyImageEditorPopupProps> = ({
  activeViewportId,
  displaySets,
  toolGroupId,
  viewportType,
  initialImageIndex,
  servicesManager,
  commandsManager,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { cornerstoneViewportService, toolGroupService, viewportGridService, toolbarService } =
    servicesManager.services;
  const [activeTool, setActiveTool] = useState<string>('WindowLevel');
  const isSavingTextAnnotationRef = useRef<boolean>(false);

  // Track when text annotation is being saved to prevent modal closing
  useEffect(() => {
    let saveTimeout: NodeJS.Timeout | null = null;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is on Save button in text input dialog
      const saveButton = target.closest('[data-cy="input-dialog-save-button"]');
      if (saveButton) {
        isSavingTextAnnotationRef.current = true;

        // Clear previous timeout
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        // Reset flag after text dialog has time to close and annotation is saved
        saveTimeout = setTimeout(() => {
          isSavingTextAnnotationRef.current = false;
        }, 1500);
      }
    };

    // Use capture phase to intercept before other handlers
    // But don't stop propagation - let Enter key work normally
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, []);

  // Wrap onClose to prevent closing when text input dialog is active
  // This allows Enter key to work normally for saving text annotations
  const wrappedOnClose = useCallback(() => {
    // Don't close if we're currently saving text annotation
    if (isSavingTextAnnotationRef.current) {
      return;
    }

    // Small delay to allow text input dialog to close first
    setTimeout(() => {
      // Check again if we're saving text annotation
      if (isSavingTextAnnotationRef.current) {
        return;
      }

      // Check if there's still an active text input dialog
      const textDialogs = document.querySelectorAll('[role="dialog"]');
      const hasTextDialog = Array.from(textDialogs).some(dialog => {
        const hasInput = dialog.querySelector('input, textarea');
        const isKeyImageModal = dialog.querySelector(`[data-viewportid="${POPUP_VIEWPORT_ID}"]`);
        return hasInput && !isKeyImageModal;
      });

      if (!hasTextDialog) {
        // No text input dialog is open, safe to close KeyImage modal
        onClose();
      }
      // Otherwise, don't close - text input dialog is still open
    }, 300);
  }, [onClose]);

  // Register toolbar buttons for popup
  useEffect(() => {
    // Save original MeasurementTools section to restore it later
    const originalSection = toolbarService.state.buttonSections['MeasurementTools']
      ? [...toolbarService.state.buttonSections['MeasurementTools']]
      : [];

    const setToolActiveToolbar = {
      commandName: 'setToolActiveToolbar',
      commandOptions: {
        toolGroupIds: [toolGroupId],
      },
    };

    // Register buttons for MeasurementTools section (only Text and Arrow for popup)
    const measurementToolsButtons = [
      {
        id: 'Text',
        uiType: 'ohif.toolButton',
        props: {
          icon: 'tool-text',
          label: 'Text',
          tooltip: 'Text Annotation',
          commands: setToolActiveToolbar,
        },
      },
      {
        id: 'ArrowAnnotate',
        uiType: 'ohif.toolButton',
        props: {
          icon: 'tool-annotate',
          label: 'Arrow',
          tooltip: 'Arrow Annotation',
          commands: setToolActiveToolbar,
        },
      },
    ];

    // Register buttons (but don't replace existing ones - use replace: false)
    toolbarService.register(measurementToolsButtons, false);

    // Temporarily update MeasurementTools section for popup (only Text and Arrow)
    toolbarService.updateSection(
      'MeasurementTools',
      measurementToolsButtons.map(b => b.id)
    );

    return () => {
      // Restore original MeasurementTools section
      if (originalSection && originalSection.length > 0) {
        toolbarService.state.buttonSections['MeasurementTools'] = originalSection;
        toolbarService._broadcastEvent(toolbarService.EVENTS.TOOL_BAR_MODIFIED, {
          ...toolbarService.state,
        });
      }

      // Don't remove buttons - they are used in main toolbar too
      // The buttons Text and ArrowAnnotate are already registered in main toolbar
    };
  }, [toolbarService, toolGroupId]);

  // Cleanup: Remove popup viewport from toolGroup and disable it when component unmounts
  useEffect(() => {
    return () => {
      try {
        // Get rendering engine
        const renderingEngine = cornerstoneViewportService.getRenderingEngine();
        if (renderingEngine) {
          // Disable the popup viewport
          renderingEngine.disableElement(POPUP_VIEWPORT_ID);
        }

        // Remove viewport from toolGroup
        const popupElement = document.querySelector(
          `[data-viewportid="${POPUP_VIEWPORT_ID}"]`
        ) as HTMLElement;
        if (popupElement) {
          try {
            const enabledElement = getEnabledElement(popupElement as any);
            if (enabledElement) {
              const toolGroup = ToolGroupManager.getToolGroupForViewport(
                POPUP_VIEWPORT_ID,
                enabledElement.renderingEngineId
              );
              if (toolGroup) {
                toolGroup.removeViewports(enabledElement.renderingEngineId, POPUP_VIEWPORT_ID);
              }
            }
          } catch (e) {
            // Viewport might already be disabled
          }
        }
      } catch (error) {
        console.warn('[KeyImage] Error during cleanup:', error);
      }
    };
  }, [cornerstoneViewportService]);

  // Add popup viewport to the same toolGroup as active viewport for annotation synchronization
  useEffect(() => {
    if (!displaySets || displaySets.length === 0) return;

    // Wait for viewport to be created
    const checkViewport = setInterval(() => {
      const popupElement = document.querySelector(
        `[data-viewportid="${POPUP_VIEWPORT_ID}"]`
      ) as HTMLElement;

      if (popupElement) {
        clearInterval(checkViewport);

        try {
          // Get enabled element for popup viewport
          const popupEnabledElement = getEnabledElement(popupElement as any);
          if (!popupEnabledElement) {
            console.warn('[KeyImage] Popup viewport enabled element not found');
            return;
          }

          // Get toolGroup for active viewport
          const activeElement = document.querySelector(
            `[data-viewportid="${activeViewportId}"]`
          ) as HTMLElement;
          if (!activeElement) {
            console.warn('[KeyImage] Active viewport element not found');
            return;
          }

          const activeEnabledElement = getEnabledElement(activeElement as any);
          if (!activeEnabledElement) {
            console.warn('[KeyImage] Active viewport enabled element not found');
            return;
          }

          const toolGroup = ToolGroupManager.getToolGroupForViewport(
            activeViewportId,
            activeEnabledElement.renderingEngineId
          );

          if (toolGroup) {
            // Synchronize camera and properties BEFORE adding to toolGroup
            // This ensures annotations are rendered with correct coordinates from the start
            try {
              const activeViewport = activeEnabledElement.viewport;
              const popupViewport = popupEnabledElement.viewport;

              // Copy camera settings (zoom, pan) and properties (window/level) for StackViewport
              if (
                activeViewport instanceof StackViewport &&
                popupViewport instanceof StackViewport
              ) {
                // Copy camera (includes zoom and pan)
                const activeCamera = activeViewport.getCamera();
                popupViewport.setCamera(activeCamera);

                // Copy properties (includes window/level)
                const properties = activeViewport.getProperties();
                popupViewport.setProperties(properties);

                // Trigger resize BEFORE adding to toolGroup to recalculate coordinates
                // This ensures annotations are rendered with correct coordinates from the start
                try {
                  const renderingEngine = cornerstoneViewportService.getRenderingEngine();
                  if (renderingEngine) {
                    // Use requestAnimationFrame for smoother update
                    requestAnimationFrame(() => {
                      try {
                        // Resize rendering engine to recalculate coordinates
                        renderingEngine.resize();
                        renderingEngine.render();

                        // Now add to toolGroup after resize is complete
                        // This ensures annotations are rendered with correct coordinates
                        requestAnimationFrame(() => {
                          toolGroup.addViewport(
                            POPUP_VIEWPORT_ID,
                            popupEnabledElement.renderingEngineId
                          );
                          console.log(
                            '[KeyImage] Added popup viewport to toolGroup after resize:',
                            toolGroup.id
                          );
                        });
                      } catch (resizeError) {
                        console.warn('[KeyImage] Error triggering resize:', resizeError);
                        // Fallback: add to toolGroup even if resize fails
                        toolGroup.addViewport(
                          POPUP_VIEWPORT_ID,
                          popupEnabledElement.renderingEngineId
                        );
                      }
                    });
                  } else {
                    // Fallback: add to toolGroup if rendering engine not available
                    toolGroup.addViewport(POPUP_VIEWPORT_ID, popupEnabledElement.renderingEngineId);
                    console.log('[KeyImage] Added popup viewport to toolGroup:', toolGroup.id);
                  }
                } catch (resizeError) {
                  console.warn('[KeyImage] Error triggering resize:', resizeError);
                  // Fallback: add to toolGroup even if resize fails
                  toolGroup.addViewport(POPUP_VIEWPORT_ID, popupEnabledElement.renderingEngineId);
                  console.log(
                    '[KeyImage] Added popup viewport to toolGroup (fallback):',
                    toolGroup.id
                  );
                }
              } else {
                // Not StackViewport, just add to toolGroup
                toolGroup.addViewport(POPUP_VIEWPORT_ID, popupEnabledElement.renderingEngineId);
                console.log('[KeyImage] Added popup viewport to toolGroup:', toolGroup.id);
              }
            } catch (syncError) {
              console.warn('[KeyImage] Error synchronizing viewport settings:', syncError);
              // Fallback: add to toolGroup even if sync fails
              toolGroup.addViewport(POPUP_VIEWPORT_ID, popupEnabledElement.renderingEngineId);
              console.log(
                '[KeyImage] Added popup viewport to toolGroup (error fallback):',
                toolGroup.id
              );
            }
          } else {
            console.warn('[KeyImage] ToolGroup not found for active viewport');
          }
        } catch (e) {
          console.warn('[KeyImage] Error adding viewport to toolGroup:', e);
        }
      }
    }, 100);

    // Cleanup interval after 5 seconds
    setTimeout(() => {
      clearInterval(checkViewport);
    }, 5000);

    return () => {
      clearInterval(checkViewport);
    };
  }, [displaySets, activeViewportId]);

  // Handler for tool activation
  const handleToolActivation = (toolName: string) => {
    setActiveTool(toolName);
    commandsManager.runCommand('setToolActiveToolbar', {
      toolName,
      toolGroupIds: [toolGroupId],
    });
  };

  const handleSave = async () => {
    try {
      // Get popup viewport element
      const popupElement = document.querySelector(
        `[data-viewportid="${POPUP_VIEWPORT_ID}"]`
      ) as HTMLElement;

      if (!popupElement) {
        throw new Error('Popup viewport element not found');
      }

      // Get canvas from popup viewport
      const canvas = popupElement.querySelector('canvas.cornerstone-canvas') as HTMLCanvasElement;
      if (!canvas) {
        throw new Error('Canvas not found in popup viewport');
      }

      // Get SVG layer with annotations
      const svgLayer = popupElement.querySelector('svg.svg-layer') as SVGElement;

      // Get metadata from active viewport
      const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
      const imageData = viewport?.getImageData();
      const metadata: any = {
        studyInstanceUID: null,
        seriesInstanceUID: null,
        sopInstanceUID: null,
        columns: null,
        rows: null,
      };

      if (imageData?.image) {
        const image = imageData.image;
        metadata.studyInstanceUID = image.getTagValue?.('x0020000d') || null;
        metadata.seriesInstanceUID = image.getTagValue?.('x0020000e') || null;
        metadata.sopInstanceUID = image.getTagValue?.('x00080018') || null;
        metadata.columns = image.getTagValue?.('x00280011') || null;
        metadata.rows = image.getTagValue?.('x00280010') || null;
      }

      // Fallback to displaySet metadata
      if (displaySets && displaySets.length > 0) {
        const displaySet = displaySets[0];
        if (displaySet?.instances?.[0]) {
          const instance = displaySet.instances[0];
          if (!metadata.studyInstanceUID) {
            metadata.studyInstanceUID = instance.StudyInstanceUID;
          }
          if (!metadata.seriesInstanceUID) {
            metadata.seriesInstanceUID = instance.SeriesInstanceUID;
          }
          if (!metadata.sopInstanceUID) {
            metadata.sopInstanceUID = instance.SOPInstanceUID;
          }
          if (!metadata.columns) {
            metadata.columns = instance.Columns;
          }
          if (!metadata.rows) {
            metadata.rows = instance.Rows;
          }
        }
      }

      // Convert canvas and SVG to PNG
      const pngBlob = await convertCanvasToPNG(canvas, svgLayer);

      // Send to server
      await sendKeyImageToServer(pngBlob, metadata);

      // Show success notification
      const { uiNotificationService } = servicesManager.services;
      uiNotificationService.show({
        title: 'Success',
        message: 'KeyImage saved successfully!',
        type: 'success',
      });

      // Don't close popup automatically - let user close it manually
    } catch (error) {
      console.error('[KeyImage] Error saving:', error);
      const { uiNotificationService } = servicesManager.services;
      uiNotificationService.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save KeyImage',
        type: 'error',
      });
    }
  };

  const convertCanvasToPNG = async (
    canvas: HTMLCanvasElement,
    svgLayer: SVGElement | null
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const canvasRect = canvas.getBoundingClientRect();
        const displayedWidth = Math.round(canvasRect.width);
        const displayedHeight = Math.round(canvasRect.height);

        let width = displayedWidth;
        let height = displayedHeight;
        let offsetX = 0;
        let offsetY = 0;
        const padding = 5;

        const scaleX = displayedWidth / canvas.width;
        const scaleY = displayedHeight / canvas.height;

        // Check if SVG annotations extend beyond canvas
        if (svgLayer && svgLayer.children.length > 0) {
          const svgBBox = getSVGBoundingBox(svgLayer, canvas);
          if (svgBBox) {
            const displayedMinX = svgBBox.minX * scaleX;
            const displayedMinY = svgBBox.minY * scaleY;
            const displayedMaxX = svgBBox.maxX * scaleX;
            const displayedMaxY = svgBBox.maxY * scaleY;

            const extendsLeft = displayedMinX < 0;
            const extendsTop = displayedMinY < 0;
            const extendsRight = displayedMaxX > width;
            const extendsBottom = displayedMaxY > height;

            if (extendsLeft || extendsTop || extendsRight || extendsBottom) {
              const newMinX = Math.min(0, displayedMinX);
              const newMinY = Math.min(0, displayedMinY);
              const newMaxX = Math.max(width, displayedMaxX);
              const newMaxY = Math.max(height, displayedMaxY);

              offsetX = newMinX - padding;
              offsetY = newMinY - padding;
              width = Math.ceil(newMaxX - newMinX + padding * 2);
              height = Math.ceil(newMaxY - newMinY + padding * 2);
            }
          }
        }

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = width;
        outputCanvas.height = height;
        const ctx = outputCanvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(
          canvas,
          0,
          0,
          canvas.width,
          canvas.height,
          offsetX,
          offsetY,
          displayedWidth,
          displayedHeight
        );

        if (svgLayer && svgLayer.children.length > 0) {
          const svgClone = svgLayer.cloneNode(true) as SVGElement;
          processTextAnnotationsInPopup(svgClone, true);
          applyWhiteSolidStyles(svgClone);

          const svgExportWidth = width;
          const svgExportHeight = height;

          svgClone.removeAttribute('width');
          svgClone.removeAttribute('height');
          svgClone.setAttribute('width', String(svgExportWidth));
          svgClone.setAttribute('height', String(svgExportHeight));

          const viewBoxX = offsetX === 0 ? 0 : -offsetX;
          const viewBoxY = offsetY === 0 ? 0 : -offsetY;
          svgClone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${width} ${height}`);
          svgClone.setAttribute('preserveAspectRatio', 'none');

          if (!svgClone.getAttribute('xmlns')) {
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }

          increaseAnnotationFontSize(svgClone);

          const svgData = new XMLSerializer().serializeToString(svgClone);
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);

          const img = new Image();
          img.onload = function () {
            try {
              ctx.drawImage(img, 0, 0, svgExportWidth, svgExportHeight);
              URL.revokeObjectURL(url);
              outputCanvas.toBlob(
                blob => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(new Error('Failed to create PNG'));
                  }
                },
                'image/png',
                1.0
              );
            } catch (e) {
              URL.revokeObjectURL(url);
              outputCanvas.toBlob(
                blob => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(new Error('Failed to create PNG'));
                  }
                },
                'image/png',
                1.0
              );
            }
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
            outputCanvas.toBlob(
              blob => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to create PNG'));
                }
              },
              'image/png',
              1.0
            );
          };
          img.src = url;
        } else {
          outputCanvas.toBlob(
            blob => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create PNG'));
              }
            },
            'image/png',
            1.0
          );
        }
      } catch (e) {
        reject(new Error('Error creating PNG: ' + (e as Error).message));
      }
    });
  };

  const getSVGBoundingBox = (svgElement: SVGElement, canvas: HTMLCanvasElement) => {
    if (!svgElement || svgElement.children.length === 0 || !canvas) {
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (canvasRect.width || canvas.width);
    const scaleY = canvas.height / (canvasRect.height || canvas.height);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasElements = false;

    const allElements = svgElement.querySelectorAll('*');

    allElements.forEach(element => {
      try {
        const rect = (element as Element).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const canvasX = (rect.left - canvasRect.left) * scaleX;
          const canvasY = (rect.top - canvasRect.top) * scaleY;
          const canvasWidth = rect.width * scaleX;
          const canvasHeight = rect.height * scaleY;

          minX = Math.min(minX, canvasX);
          minY = Math.min(minY, canvasY);
          maxX = Math.max(maxX, canvasX + canvasWidth);
          maxY = Math.max(maxY, canvasY + canvasHeight);
          hasElements = true;
        }
      } catch (e) {
        // Skip
      }
    });

    if (!hasElements || minX === Infinity) {
      return null;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  const processTextAnnotationsInPopup = (svgElement: SVGElement, removeInsteadOfHide = false) => {
    if (!svgElement) return;

    const allChildren = Array.from(svgElement.children);
    const textGroups: Array<{ group: Element; index: number }> = [];

    allChildren.forEach((child, index) => {
      if (child.tagName === 'g' || child.tagName === 'G') {
        const hasText = child.querySelector('text');
        if (hasText) {
          textGroups.push({ group: child, index });
        }
      }
    });

    textGroups.forEach(({ group, index }) => {
      let linesBefore = 0;
      for (let i = index - 1; i >= 0; i--) {
        const element = allChildren[i];
        if (element && element.tagName === 'line') {
          if (removeInsteadOfHide) {
            element.remove();
          } else {
            (element as HTMLElement).style.setProperty('display', 'none', 'important');
            element.setAttribute('data-text-annotation', 'true');
          }
          linesBefore++;
          if (linesBefore >= 3) break;
        } else if (element && element.tagName !== 'line') {
          break;
        }
      }

      for (let i = index + 1; i < allChildren.length; i++) {
        const element = allChildren[i];
        if (element && element.tagName === 'line') {
          if (removeInsteadOfHide) {
            element.remove();
          } else {
            (element as HTMLElement).style.setProperty('display', 'none', 'important');
            element.setAttribute('data-text-annotation', 'true');
          }
          break;
        } else if (element && element.tagName !== 'line' && element.tagName !== 'g') {
          break;
        }
      }
    });
  };

  const applyWhiteSolidStyles = (svgElement: SVGElement) => {
    if (!svgElement) return;

    const lineElements = svgElement.querySelectorAll(
      'line, path, polyline, polygon, circle, ellipse, rect'
    );
    lineElements.forEach(el => {
      el.setAttribute('stroke', '#ffffff');
      el.setAttribute('stroke-width', '2');
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-dashoffset');
      (el as HTMLElement).style.setProperty('stroke', '#ffffff', 'important');
      (el as HTMLElement).style.setProperty('stroke-width', '2px', 'important');
      (el as HTMLElement).style.setProperty('stroke-dasharray', 'none', 'important');
      (el as HTMLElement).style.setProperty('stroke-dashoffset', '0', 'important');
      (el as HTMLElement).style.setProperty(
        'filter',
        'drop-shadow(0 0 0.5px #000000) drop-shadow(0 0 0.5px #000000)',
        'important'
      );

      const fill = el.getAttribute('fill');
      if (!fill || fill === 'none' || fill === 'transparent') {
        el.setAttribute('fill', 'none');
        (el as HTMLElement).style.setProperty('fill', 'none', 'important');
      }
    });

    const textElements = svgElement.querySelectorAll('text');
    textElements.forEach(textEl => {
      textEl.setAttribute('fill', '#ffffff');
      const textElement = textEl as unknown as HTMLElement;
      textElement.style.setProperty('fill', '#ffffff', 'important');
      textElement.style.setProperty('stroke', 'none', 'important');
    });
  };

  const increaseAnnotationFontSize = (svgElement: SVGElement) => {
    if (!svgElement) return;

    const textElements = svgElement.querySelectorAll('text');
    textElements.forEach(textEl => {
      const currentSize = textEl.getAttribute('font-size');
      if (currentSize) {
        const sizeMatch = currentSize.match(/(\d+(?:\.\d+)?)/);
        if (sizeMatch) {
          const baseSize = parseFloat(sizeMatch[1]);
          const newSize = Math.round(baseSize * 1.8);
          textEl.setAttribute('font-size', String(newSize));
        } else {
          textEl.setAttribute('font-size', '1.8em');
        }
      } else {
        textEl.setAttribute('font-size', '1.8em');
      }
    });
  };

  const sendKeyImageToServer = async (pngBlob: Blob, metadata: any) => {
    const formData = new FormData();
    formData.append('image', pngBlob, 'keyimage.png');

    if (metadata.studyInstanceUID) {
      formData.append('study_iuid', metadata.studyInstanceUID);
    }
    if (metadata.seriesInstanceUID) {
      formData.append('series_iuid', metadata.seriesInstanceUID);
    }
    if (metadata.sopInstanceUID) {
      formData.append('sop_iuid', metadata.sopInstanceUID);
    }

    const uploadUrl = (window as any).config?.keyimageUploadUrl || '/api/keyimage/upload';

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || errorData.message || errorDetail;
      } catch (e) {
        const errorText = await response.text();
        if (errorText) {
          errorDetail = errorText.substring(0, 200);
        }
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  };

  if (!displaySets || displaySets.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-[#1a1a1a] p-5">
        <div className="text-white">No display sets available</div>
      </div>
    );
  }

  return (
    <div className="box-border flex h-full w-full flex-col overflow-hidden rounded-lg bg-[#1a1a1a] p-5 shadow-lg">
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-2 border-b border-[#333] pb-4">
        {/* Measurement Tools with Dropdown - same as main toolbar */}
        <ToolButtonListWrapper
          buttonSection="MeasurementTools"
          id="MeasurementTools"
        />

        {/* Navigation Tools - same style as main toolbar */}
        <ToolButton
          id="Zoom"
          icon="tool-zoom"
          label="Zoom"
          tooltip="Zoom"
          isActive={activeTool === 'Zoom'}
          onInteraction={() => handleToolActivation('Zoom')}
        />
        <ToolButton
          id="Pan"
          icon="tool-move"
          label="Pan"
          tooltip="Pan"
          isActive={activeTool === 'Pan'}
          onInteraction={() => handleToolActivation('Pan')}
        />
        <ToolButton
          id="WindowLevel"
          icon="tool-window-level"
          label="W/L"
          tooltip="Window Level"
          isActive={activeTool === 'WindowLevel'}
          onInteraction={() => handleToolActivation('WindowLevel')}
        />

        {/* Action Buttons */}
        <div className="ml-auto">
          <button
            onClick={handleSave}
            className="focus-visible:ring-ring bg-primary/60 text-primary-foreground hover:bg-primary/100 inline-flex h-7 min-w-[80px] items-center justify-center whitespace-nowrap rounded px-2 py-2 text-base font-normal leading-tight transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50"
          >
            Save KeyImage
          </button>
        </div>
      </div>

      {/* Cornerstone Viewport */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1"
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-white">
              Loading viewport...
            </div>
          }
        >
          <OHIFCornerstoneViewportComponent
            viewportId={POPUP_VIEWPORT_ID}
            displaySets={displaySets}
            viewportOptions={{
              viewportId: POPUP_VIEWPORT_ID,
              viewportType: viewportType as any,
              toolGroupId: toolGroupId,
            }}
            servicesManager={servicesManager}
            dataSource={servicesManager.dataSource}
            displaySetOptions={displaySets.map(() => ({}))}
            initialImageIndex={initialImageIndex}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default KeyImageEditorPopup;
