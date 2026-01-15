import React, { useEffect, useRef, Suspense, useState, useCallback } from 'react';
import { getEnabledElement, StackViewport } from '@cornerstonejs/core';
import { ToolGroupManager, annotation as annotationModule } from '@cornerstonejs/tools';
import { ToolButton, Icons } from '@ohif/ui-next';
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
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const { cornerstoneViewportService, toolGroupService, viewportGridService, toolbarService } =
    servicesManager.services;
  const [activeTool, setActiveTool] = useState<string>('WindowLevel');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [cropArea, setCropArea] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    type: 'create' | 'move' | 'resize';
    handle?: string; // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    startX: number;
    startY: number;
    originalCrop: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const isSavingTextAnnotationRef = useRef<boolean>(false);

  // Helper to determine cursor style
  const getCursorStyle = (handle: string) => {
    switch (handle) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      case 'move':
        return 'move';
      default:
        return 'crosshair';
    }
  };

  // Helper to get handle at position
  const getHandleAtPosition = (x: number, y: number, crop: { x: number; y: number; width: number; height: number }) => {
    const handleSize = 10;
    const { x: cx, y: cy, width: cw, height: ch } = crop;

    // Check corners
    if (Math.abs(x - cx) <= handleSize && Math.abs(y - cy) <= handleSize) return 'nw';
    if (Math.abs(x - (cx + cw)) <= handleSize && Math.abs(y - cy) <= handleSize) return 'ne';
    if (Math.abs(x - cx) <= handleSize && Math.abs(y - (cy + ch)) <= handleSize) return 'sw';
    if (Math.abs(x - (cx + cw)) <= handleSize && Math.abs(y - (cy + ch)) <= handleSize) return 'se';

    // Check edges
    if (Math.abs(y - cy) <= handleSize && x >= cx && x <= cx + cw) return 'n';
    if (Math.abs(y - (cy + ch)) <= handleSize && x >= cx && x <= cx + cw) return 's';
    if (Math.abs(x - cx) <= handleSize && y >= cy && y <= cy + ch) return 'w';
    if (Math.abs(x - (cx + cw)) <= handleSize && y >= cy && y <= cy + ch) return 'e';

    // Check inside
    if (x > cx && x < cx + cw && y > cy && y < cy + ch) return 'move';

    return null;
  };

  // Draw crop overlay on canvas
  const drawCropOverlay = useCallback(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const crop =
      cropArea ||
      (dragState?.type === 'create'
        ? {
            x: Math.min(dragState.startX, dragState.startX), // simplified for now, will calculate in realtime during create
            y: Math.min(dragState.startY, dragState.startY),
            width: 0,
            height: 0,
          }
        : null);

    // If implementing create visualization differently (calculating current rect from start drag), pass it in or calculate it.
    // For 'create' mode, we usually calculate current rect from start position and current mouse position.
    // Since drawCropOverlay is called from effect dependent on cropArea, passing dynamic create rect is tricky without state.
    // Let's rely on setCropArea being called during create drag for smooth updates.

    if (!crop) return;

    // Draw dark overlay outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Fill all first

    // Clear the crop area (make it transparent)
    ctx.clearRect(crop.x, crop.y, crop.width, crop.height);

    // Re-draw the semi-transparent black around the crop area explicitly to ensure clean edges (optional, but 'clearRect' on transparent canvas works)
    // Actually, clearRect on a filled canvas makes a hole. Since we want an overlay, the hole is perfect.

    // Wait, if I fill everything, I lose the underlying image behind the canvas?
    // No, the canvas is on top. So clearing the rect reveals the image below. Correct.

    // Draw crop border
    ctx.strokeStyle = 'rgb(94, 129, 244)'; // Blue matching Save button
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]); // Dashed pattern
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
    ctx.setLineDash([]); // Reset

    // Draw resize handles
    const handleSize = 8;
    ctx.fillStyle = 'rgb(94, 129, 244)';
    const handles = [
      { x: crop.x, y: crop.y }, // nw
      { x: crop.x + crop.width / 2, y: crop.y }, // n
      { x: crop.x + crop.width, y: crop.y }, // ne
      { x: crop.x + crop.width, y: crop.y + crop.height / 2 }, // e
      { x: crop.x + crop.width, y: crop.y + crop.height }, // se
      { x: crop.x + crop.width / 2, y: crop.y + crop.height }, // s
      { x: crop.x, y: crop.y + crop.height }, // sw
      { x: crop.x, y: crop.y + crop.height / 2 }, // w
    ];

    handles.forEach(handle => {
      ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    });

  }, [cropArea, dragState]);

  // Redraw crop overlay when crop area changes
  useEffect(() => {
    drawCropOverlay();
  }, [cropArea, dragState, drawCropOverlay]);

  // Setup crop canvas size to match viewport
  useEffect(() => {
    const updateCropCanvasSize = () => {
      const popupElement = document.querySelector(
        `[data-viewportid="${POPUP_VIEWPORT_ID}"]`
      ) as HTMLElement;

      if (!popupElement || !cropCanvasRef.current) return;

      const canvas = popupElement.querySelector('canvas.cornerstone-canvas') as HTMLCanvasElement;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      cropCanvasRef.current.width = rect.width;
      cropCanvasRef.current.height = rect.height;
      cropCanvasRef.current.style.width = `${rect.width}px`;
      cropCanvasRef.current.style.height = `${rect.height}px`;

      drawCropOverlay();
    };

    // Update size initially and on window resize
    const timer = setInterval(updateCropCanvasSize, 500);
    window.addEventListener('resize', updateCropCanvasSize);

    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', updateCropCanvasSize);
    };
  }, [drawCropOverlay]);

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

    // Clean up crop state
    setCropArea(null);
    setDragState(null);

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
    // Special handling for Crop tool (custom implementation)
    if (toolName === 'Crop') {
      if (activeTool === 'Crop') {
        // Deactivate Crop
        setActiveTool('WindowLevel');
        commandsManager.runCommand('setToolActiveToolbar', {
          toolName: 'WindowLevel',
          toolGroupIds: [toolGroupId],
        });
      } else {
        // Activate Crop
        setActiveTool('Crop');
        // Deactivate any Cornerstone tools
        commandsManager.runCommand('setToolActiveToolbar', {
          toolName: '',
          toolGroupIds: [toolGroupId],
        });
      }
      return;
    }

    // Normal tool activation
    setActiveTool(toolName);
    commandsManager.runCommand('setToolActiveToolbar', {
      toolName,
      toolGroupIds: [toolGroupId],
    });
  };


  // Handle crop canvas mouse events
  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'Crop') return;

      const canvas = cropCanvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (cropArea) {
        const handle = getHandleAtPosition(x, y, cropArea);
        if (handle) {
          setDragState({
            type: handle === 'move' ? 'move' : 'resize',
            handle,
            startX: x,
            startY: y,
            originalCrop: { ...cropArea },
          });
          return;
        }
      }

      // If no handle hit or no crop area, start new creation
      setCropArea(null);
      setDragState({
        type: 'create',
        startX: x,
        startY: y,
        originalCrop: { x, y, width: 0, height: 0 },
      });
    },
    [activeTool, cropArea]
  );

  const handleCropMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = cropCanvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

        // Update cursor style if not dragging
      if (!dragState && cropArea) {
        const handle = getHandleAtPosition(x, y, cropArea);
        canvas.style.cursor = handle ? getCursorStyle(handle) : 'crosshair';
        return;
      }

      if (!dragState) {
          canvas.style.cursor = 'crosshair';
          return;
      }

      // Handle Dragging
      const dx = x - dragState.startX;
      const dy = y - dragState.startY;

      if (dragState.type === 'move') {
        const newX = dragState.originalCrop.x + dx;
        const newY = dragState.originalCrop.y + dy;

        // Clamp to canvas bounds
        const clampedX = Math.max(0, Math.min(newX, canvas.width - dragState.originalCrop.width));
        const clampedY = Math.max(0, Math.min(newY, canvas.height - dragState.originalCrop.height));

        setCropArea({
          ...dragState.originalCrop,
          x: clampedX,
          y: clampedY,
        });
      } else if (dragState.type === 'resize') {
          const { originalCrop, handle } = dragState;
          let newX = originalCrop.x;
          let newY = originalCrop.y;
          let newWidth = originalCrop.width;
          let newHeight = originalCrop.height;

          // Horizontal Resize
          if (handle?.includes('e')) {
              newWidth = Math.max(10, originalCrop.width + dx);
          } else if (handle?.includes('w')) {
              const proposedWidth = originalCrop.width - dx;
               if (proposedWidth > 10) {
                  newX = originalCrop.x + dx;
                  newWidth = proposedWidth;
               }
          }

          // Vertical Resize
          if (handle?.includes('s')) {
              newHeight = Math.max(10, originalCrop.height + dy);
          } else if (handle?.includes('n')) {
              const proposedHeight = originalCrop.height - dy;
              if (proposedHeight > 10) {
                  newY = originalCrop.y + dy;
                  newHeight = proposedHeight;
              }
          }

          setCropArea({
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
          });

      } else if (dragState.type === 'create') {
        const startX = dragState.startX;
        const startY = dragState.startY;

        const currentX = Math.max(0, Math.min(x, canvas.width));
        const currentY = Math.max(0, Math.min(y, canvas.height));

        const newCrop = {
          x: Math.min(startX, currentX),
          y: Math.min(startY, currentY),
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        };

        setCropArea(newCrop);
      }
    },
    [dragState, cropArea]
  );

  const handleCropMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleSave = async () => {
    setIsUploading(true);

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
      const response = await sendKeyImageToServer(pngBlob, metadata);

      // Clear crop area after successful save
      setCropArea(null);
      setDragState(null);

      // Show success notification
      const { uiNotificationService } = servicesManager.services;
      uiNotificationService.show({
        title: 'Success',
        message: `KeyImage saved successfully! SOP UID: ${response.sop_instance_uid || 'N/A'}`,
        type: 'success',
        duration: 5000,
      });

      // Don't close popup automatically - let user close it manually
    } catch (error) {
      console.error('[KeyImage] Error saving:', error);
      const { uiNotificationService } = servicesManager.services;
      uiNotificationService.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save KeyImage',
        type: 'error',
        duration: 8000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const convertCanvasToPNG = async (
    canvas: HTMLCanvasElement,
    svgLayer: SVGElement | null
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        // Use NATIVE canvas resolution, not displayed CSS size
        // This prevents distortion/downsampling and keeps original quality
        const nativeWidth = canvas.width;
        const nativeHeight = canvas.height;

        // Calculate scaling factor between display (CSS) and native (Bitmap)
        // We use this to translate crop coordinates (which are in CSS pixels) to native pixels
        const canvasRect = canvas.getBoundingClientRect();
        const displayWidth = canvasRect.width || nativeWidth;
        const displayHeight = canvasRect.height || nativeHeight;

        const scaleX = nativeWidth / displayWidth;
        const scaleY = nativeHeight / displayHeight;

        // Determine output dimensions and offsets in NATIVE pixels
        let outputWidth = nativeWidth;
        let outputHeight = nativeHeight;
        let outputX = 0;
        let outputY = 0;

        // Increased padding to prevent arrow cutoffs (markers often extend beyond bounding box)
        const padding = 20;

        if (cropArea) {
          // Crop mode: Convert crop area (CSS pixels) to Native pixels
          outputX = Math.round(cropArea.x * scaleX);
          outputY = Math.round(cropArea.y * scaleY);
          outputWidth = Math.round(cropArea.width * scaleX);
          outputHeight = Math.round(cropArea.height * scaleY);
        } else if (svgLayer && svgLayer.children.length > 0) {
          // Auto-expand mode (only if not manually cropping)

          // helper getSVGBoundingBox returns coordinates in NATIVE pixels directly
          const svgBBox = getSVGBoundingBox(svgLayer, canvas);

          if (svgBBox) {
            // svgBBox is already in native pixels, NO need to scale again
            const svgMinX = svgBBox.minX;
            const svgMinY = svgBBox.minY;
            const svgMaxX = svgBBox.maxX;
            const svgMaxY = svgBBox.maxY;

            // Check boundaries
            const extendsLeft = svgMinX < 0;
            const extendsTop = svgMinY < 0;
            const extendsRight = svgMaxX > nativeWidth;
            const extendsBottom = svgMaxY > nativeHeight;

            if (extendsLeft || extendsTop || extendsRight || extendsBottom) {
              // Expand canvas to fit annotations
              const newMinX = Math.min(0, svgMinX);
              const newMinY = Math.min(0, svgMinY);
              const newMaxX = Math.max(nativeWidth, svgMaxX);
              const newMaxY = Math.max(nativeHeight, svgMaxY);

              outputX = Math.floor(newMinX - padding);
              outputY = Math.floor(newMinY - padding);
              outputWidth = Math.ceil(newMaxX - newMinX + padding * 2);
              outputHeight = Math.ceil(newMaxY - newMinY + padding * 2);
            }
          }
        }

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = outputWidth;
        outputCanvas.height = outputHeight;
        const ctx = outputCanvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Fill black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, outputWidth, outputHeight);

        // Draw image data
        // We draw from the source canvas (native pixels) to output canvas
        // Source Rect: [outputX, outputY, outputWidth, outputHeight] (clamped to canvas bounds)
        // If outputX is negative (due to annotation overflow), we draw the image offseted

        const drawX = outputX < 0 ? -outputX : 0; // Where to draw on output canvas
        const drawY = outputY < 0 ? -outputY : 0;

        // Source coordinates matching valid canvas area
        const sourceX = Math.max(0, outputX);
        const sourceY = Math.max(0, outputY);
        // Width/Height to copy - clamp to what's available in source
        const sourceW = Math.min(outputWidth, nativeWidth - sourceX);
        const sourceH = Math.min(outputHeight, nativeHeight - sourceY);

        if (sourceW > 0 && sourceH > 0) {
            ctx.drawImage(
                canvas,
                sourceX, sourceY, sourceW, sourceH, // Source
                drawX, drawY, sourceW, sourceH      // Dest
            );
        }

        // Draw SVG Overlay
        if (svgLayer && svgLayer.children.length > 0) {
          const svgClone = svgLayer.cloneNode(true) as SVGElement;

          // processTextAnnotationsInPopup DESTROYS Arrow annotations (which consist of lines + text).
          // Since TextTool is "text-only" (no lines), this function is unnecessary for Text
          // and harmful for Arrows. Disabling it to preserve Arrows.
          // processTextAnnotationsInPopup(svgClone, true);

          applyWhiteSolidStyles(svgClone);

          // We must set the SVG width/height to match our OUTPUT canvas
          svgClone.setAttribute('width', String(outputWidth));
          svgClone.setAttribute('height', String(outputHeight));

          // ViewBox must map to the NATIVE coordinate system we just defined
          // The original SVG uses the viewport's client size (CSS pixels) usually
          // But our new canvas is scaled by `scaleX`/`scaleY`
          // So we need to correct the viewBox to represent the `outputX/Y` region
          // but in CSS pixels logic? No, wait.
          // The SVG annotations are defined in CSS-pixel-like coordinates usually (client space).
          // BUT since we just scaled the backing image up to native, we effectively zoomed in.
          // If we want the SVG to match the image, we probably need to keep the viewBox in CSS pixels
          // but scaled or ...
          //
          // SIMPLER APPROACH:
          // The SVG overlay sits on top of the canvas in the DOM.
          // If canvas is 1000px wide (native) but displayed at 500px (css), scale is 2.
          // The SVG coordinates are likely in the 500px space (if it's an overlay).
          // So if we have a line from 0 to 500, it covers the whole image.
          // Our output canvas is 1000px wide.
          // If we use viewBox="0 0 500 500", it will stretch to the 1000px width. That is correct!
          // So viewBox should be in "Display/CSS Coordinates".

          // Convert our NATIVE output coordinates back to CSS coordinates for viewBox
          const viewBoxX = outputX / scaleX;
          const viewBoxY = outputY / scaleY;
          const viewBoxW = outputWidth / scaleX;
          const viewBoxH = outputHeight / scaleY;

          svgClone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`);
          svgClone.setAttribute('preserveAspectRatio', 'none');

          if (!svgClone.getAttribute('xmlns')) {
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }

          // increaseAnnotationFontSize(svgClone);

          const svgData = new XMLSerializer().serializeToString(svgClone);
          // Use encodeURIComponent to handle special chars safely
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);

          const img = new Image();
          img.onload = function () {
            try {
              // Draw SVG scaled up to full native resolution
              ctx.drawImage(img, 0, 0, outputWidth, outputHeight);
              URL.revokeObjectURL(url);
              outputCanvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
                'image/png',
                1.0
              );
            } catch (e) {
              URL.revokeObjectURL(url);
              // Try to save anyway if SVG fails
              outputCanvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
                'image/png',
                1.0
              );
            }
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
             outputCanvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
                'image/png',
                1.0
              );
          };
          img.src = url;
        } else {
           outputCanvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
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
        if (element && (element.tagName === 'line' || element.tagName === 'LINE')) {
          // Check if this line is part of an Arrow (has markers)
          // If so, DO NOT hide it.
          if (element.getAttribute('marker-end') || element.getAttribute('marker-start')) {
            break; // Stop looking this direction, it's an arrow
          }

          if (removeInsteadOfHide) {
            element.remove();
          } else {
            (element as HTMLElement).style.setProperty('display', 'none', 'important');
            element.setAttribute('data-text-annotation', 'true');
          }
          linesBefore++;
          if (linesBefore >= 3) break;
        } else if (element && element.tagName !== 'line' && element.tagName !== 'LINE') {
          break;
        }
      }

      for (let i = index + 1; i < allChildren.length; i++) {
        const element = allChildren[i];
        if (element && (element.tagName === 'line' || element.tagName === 'LINE')) {
          // Check if this line is part of an Arrow (has markers)
          // If so, DO NOT hide it.
          if (element.getAttribute('marker-end') || element.getAttribute('marker-start')) {
             break; // Stop looking this direction, it's an arrow
          }

          if (removeInsteadOfHide) {
            element.remove();
          } else {
            (element as HTMLElement).style.setProperty('display', 'none', 'important');
            element.setAttribute('data-text-annotation', 'true');
          }
          break;
        } else if (element && element.tagName !== 'line' && element.tagName !== 'LINE' && element.tagName !== 'g' && element.tagName !== 'G') {
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

    // Study Instance UID is required
    if (!metadata.studyInstanceUID) {
      throw new Error('Study Instance UID is required for KeyImage upload');
    }

    formData.append('study_iuid', metadata.studyInstanceUID);

    if (metadata.seriesInstanceUID) {
      formData.append('series_iuid', metadata.seriesInstanceUID);
    }
    if (metadata.sopInstanceUID) {
      formData.append('sop_iuid', metadata.sopInstanceUID);
    }

    const uploadUrl = (window as any).config?.keyimageUploadUrl || '/api/keyimage/upload';

    console.log('[KeyImage] Uploading to:', uploadUrl);
    console.log('[KeyImage] Metadata:', metadata);

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
      throw new Error(`Upload error: ${errorDetail}`);
    }

    const result = await response.json();

    if (result.status !== 'success') {
      throw new Error(result.message || 'Unknown error during upload');
    }

    return result;
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

        {/* Crop Tool - only for KeyImage popup */}
        <div className="ml-2 border-l border-[#333] pl-2">
          <ToolButton
            id="Crop"
            icon="tool-window-region"
            label="Crop"
            tooltip="Select Area to Crop"
            isActive={activeTool === 'Crop'}
            onInteraction={() => handleToolActivation('Crop')}
          />
        </div>

        {/* Action Buttons */}
        <div className="ml-auto">
          <button
            onClick={handleSave}
            disabled={isUploading}
            className="focus-visible:ring-ring bg-primary/60 text-primary-foreground hover:bg-primary/100 inline-flex h-7 min-w-[80px] items-center justify-center whitespace-nowrap rounded px-2 py-2 text-base font-normal leading-tight transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Icons.LoadingSpinner className="mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              'Save KeyImage'
            )}
          </button>
        </div>
      </div>

      {/* Hint for Crop tool */}
      {activeTool === 'Crop' && (
        <div className="bg-primary/20 mb-2 rounded px-3 py-2 text-sm text-white">
          💡 Draw a rectangle on the image to select the area to save
        </div>
      )}

      {/* Cornerstone Viewport */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1"
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

        {/* Crop Canvas Overlay */}
        {activeTool === 'Crop' && (
          <canvas
            ref={cropCanvasRef}
            className="pointer-events-auto absolute left-0 top-0"
            style={{
              cursor: 'crosshair',
              zIndex: 1000,
            }}
            onMouseDown={handleCropMouseDown}
            onMouseMove={handleCropMouseMove}
            onMouseUp={handleCropMouseUp}
            onMouseLeave={handleCropMouseUp}
          />
        )}
      </div>

      {/* Loading Overlay */}
      {isUploading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center space-y-4">
            <Icons.LoadingSpinner className="h-12 w-12 text-white" />
            <p className="text-lg text-white">Saving KeyImage...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeyImageEditorPopup;
