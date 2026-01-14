import { ArrowAnnotateTool, annotation, drawing } from '@cornerstonejs/tools';
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes } from '@cornerstonejs/tools';
import guid from '@ohif/core/src/utils/guid';

/**
 * TextTool - A tool for adding text annotations.
 * On click, immediately shows a popup for text input.
 * Renders only text, without arrow and connecting line.
 */
class TextTool extends ArrowAnnotateTool {
  static toolName = 'Text';

  /**
   * Override addNewAnnotation to create annotation with a single point
   * and immediately show the popup
   */
  addNewAnnotation = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;

    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return null;
    }

    const { viewport } = enabledElement;

    // Get click coordinates in world space
    const worldPos = currentPoints.world;

    // Create annotation with a single point (click location)
    const newAnnotation = this.createAnnotation({
      worldPos,
      viewport,
      element,
    });

    if (!newAnnotation) {
      return null;
    }

    // Save annotation
    annotation.state.addAnnotation(newAnnotation);

    // Immediately show popup for text input
    const config = this.configuration;
    if (config?.getTextCallback) {
      config.getTextCallback(
        (text: string) => {
          // Save text to annotation
          newAnnotation.data.text = text || '';
          // Invalidate annotation to trigger re-render
          newAnnotation.invalidated = true;
          const renderingEngine = viewport.getRenderingEngine();
          renderingEngine.renderViewports([viewport.id]);
        },
        {
          annotation: newAnnotation,
          viewport,
          element,
        }
      );
    }

    return newAnnotation;
  };

  /**
   * Creates annotation with a single point
   */
  private createAnnotation({
    worldPos,
    viewport,
    element,
  }: {
    worldPos: Types.Point3;
    viewport: Types.IViewport;
    element: HTMLDivElement;
  }) {
    const annotationUID = guid();

    // Get referencedImageId
    const canvasPos = viewport.worldToCanvas(worldPos);
    let referencedImageId: string | undefined;

    if ((viewport as any).getImageId) {
      referencedImageId = (viewport as any).getImageId(canvasPos);
    } else if ((viewport as any).getCurrentImageId) {
      referencedImageId = (viewport as any).getCurrentImageId();
    }

    if (!referencedImageId) {
      return null;
    }

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    // Create annotation with a single point (click location)
    // Note: We use two identical points for compatibility with ArrowAnnotateTool
    // but only use the first point during rendering
    const newAnnotation: any = {
      annotationUID,
      highlighted: false,
      isLocked: false,
      invalidated: false,
      metadata: {
        toolName: this.getToolName(),
        referencedImageId,
        FrameOfReferenceUID,
        viewplaneNormal: viewport.getCamera().viewPlaneNormal,
        viewUp: viewport.getCamera().viewUp,
      },
      data: {
        text: '', // Text will be added after input
        handles: {
          // Two identical points for compatibility with ArrowAnnotateTool
          // Only the first point is used during rendering
          points: [worldPos, worldPos],
          textBox: {
            worldPosition: worldPos, // Text position = click location (center)
          },
        },
        cachedStats: {},
      },
    };

    return newAnnotation;
  }

  /**
   * Override isPointNearTool to work with a single point
   * ArrowAnnotateTool expects two points, but we only have one
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: any,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return false;
    }

    const { viewport } = enabledElement;
    const { data } = annotation;

    if (!data?.handles?.points?.length) {
      return false;
    }

    // Check proximity to click point (first and only point)
    const clickPoint = data.handles.points[0];
    const canvasPoint = viewport.worldToCanvas(clickPoint);

    const distance = Math.sqrt(
      Math.pow(canvasCoords[0] - canvasPoint[0], 2) + Math.pow(canvasCoords[1] - canvasPoint[1], 2)
    );

    // Also check proximity to textBox if it exists
    if (data.handles?.textBox?.worldBoundingBox) {
      const { topLeft, bottomRight } = data.handles.textBox.worldBoundingBox;
      const topLeftCanvas = viewport.worldToCanvas(topLeft);
      const bottomRightCanvas = viewport.worldToCanvas(bottomRight);

      const isInTextBox =
        canvasCoords[0] >= topLeftCanvas[0] &&
        canvasCoords[0] <= bottomRightCanvas[0] &&
        canvasCoords[1] >= topLeftCanvas[1] &&
        canvasCoords[1] <= bottomRightCanvas[1];

      if (isInTextBox) {
        return true;
      }
    }

    return distance <= proximity;
  };

  /**
   * Override renderAnnotation - render only text, without arrow and line
   */
  renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: any): boolean => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    // Get all annotations for this tool (Text)
    const annotations = annotation.state.getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return false;
    }

    // Get current imageId from viewport for filtering annotations
    let currentImageId: string | undefined;
    if ((viewport as any).getCurrentImageId) {
      currentImageId = (viewport as any).getCurrentImageId();
    }

    const styleSpecifier = {
      toolName: this.getToolName(),
      viewportId: viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotationItem = annotations[i];
      const { annotationUID, data, metadata } = annotationItem;

      // Filter annotations by current image
      // Only show annotations that belong to the current image
      if (currentImageId && metadata?.referencedImageId && metadata.referencedImageId !== currentImageId) {
        continue;
      }

      // Check for point (click location)
      if (!data?.handles?.points?.length) {
        continue;
      }

      // Get styles for text
      const styleSpecifierWithAnnotation = {
        ...styleSpecifier,
        annotationUID,
      };

      const textBoxOptions = this.getLinkedTextBoxStyle(styleSpecifierWithAnnotation, annotationItem);

      // Get text from annotation
      const textLines = data.text ? [data.text] : [''];

      // Click point is the center of the text
      const clickPoint = data.handles.points[0];

      // Initialize textBox if it doesn't exist
      if (!data.handles.textBox) {
        data.handles.textBox = {};
      }

      // Determine text center in world coordinates
      // Use saved center if available (after first render), otherwise use click point
      const textBoxCenterWorld: Types.Point3 = data.handles.textBox.worldPosition || clickPoint;

      // Save center if not set
      if (!data.handles.textBox.worldPosition) {
        data.handles.textBox.worldPosition = clickPoint;
      }

      // Convert center to canvas coordinates
      const textBoxCenterCanvas = viewport.worldToCanvas(textBoxCenterWorld);

      // Get text size (cache for optimization)
      const currentText = textLines.join('\n');
      let textWidth: number;
      let textHeight: number;

      if (data.handles.textBox.cachedSize && data.handles.textBox.cachedText === currentText) {
        // Use cached size
        textWidth = data.handles.textBox.cachedSize.width;
        textHeight = data.handles.textBox.cachedSize.height;
      } else {
        // Need to get text size
        // First render at approximate position to get size, then re-render at correct position
        // We'll use the real element but update its position after getting the size
        const approximatePosition: Types.Point2 = textBoxCenterCanvas;
        const tempBoundingBox = drawing.drawTextBox(
          svgDrawingHelper,
          annotationUID,
          'textBox',
          textLines,
          approximatePosition,
          textBoxOptions
        );

        if (!tempBoundingBox) {
          continue;
        }

        textWidth = tempBoundingBox.width;
        textHeight = tempBoundingBox.height;

        // Cache size for next render
        data.handles.textBox.cachedSize = { width: textWidth, height: textHeight };
        data.handles.textBox.cachedText = currentText;

        // Now we have the size, so we'll re-render at the correct position below
        // The element will be updated in place by the next drawTextBox call
      }

      // Always calculate top-left position so center is at textBoxCenterCanvas
      // This ensures text is always centered relative to click point
      const textBoxPosition: Types.Point2 = [
        textBoxCenterCanvas[0] - textWidth / 2,
        textBoxCenterCanvas[1] - textHeight / 2,
      ];

      // Render text at correct position (center matches click point)
      const boundingBox = drawing.drawTextBox(
        svgDrawingHelper,
        annotationUID,
        'textBox',
        textLines,
        textBoxPosition,
        textBoxOptions
      );

      // Save boundingBox and update center if needed
      if (boundingBox && data.handles.textBox) {
        const { x: left, y: top, width, height } = boundingBox;

        // Save boundingBox
        data.handles.textBox.worldBoundingBox = {
          topLeft: viewport.canvasToWorld([left, top]),
          topRight: viewport.canvasToWorld([left + width, top]),
          bottomLeft: viewport.canvasToWorld([left, top + height]),
          bottomRight: viewport.canvasToWorld([left + width, top + height]),
        };

        // Calculate actual text center and update worldPosition
        // This is needed for accuracy, as actual size may differ slightly
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const centerCanvas: Types.Point2 = [centerX, centerY];
        const actualCenterWorld = viewport.canvasToWorld(centerCanvas);

        // Update center only if not set or text changed
        if (!data.handles.textBox.worldPosition || data.handles.textBox.cachedText !== currentText) {
          data.handles.textBox.worldPosition = actualCenterWorld;
        }
      }
    }

    return true;
  };
}

export default TextTool;
