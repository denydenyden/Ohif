import { ArrowAnnotateTool, annotation, drawing } from '@cornerstonejs/tools';
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes } from '@cornerstonejs/tools';
import guid from '@ohif/core/src/utils/guid';

/**
 * TextTool - инструмент для добавления текстовых аннотаций
 * При клике сразу показывает попап для ввода текста
 * Рисует только текст, без стрелки и линии
 */
class TextTool extends ArrowAnnotateTool {
  static toolName = 'Text';

  /**
   * Переопределяем addNewAnnotation для создания аннотации с одной точкой
   * и немедленного показа попапа
   */
  addNewAnnotation = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;

    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return null;
    }

    const { viewport } = enabledElement;

    // Получаем координаты клика в мировых координатах
    const worldPos = currentPoints.world;

    // Создаем аннотацию с одной точкой (место клика)
    const newAnnotation = this.createAnnotation({
      worldPos,
      viewport,
      element,
    });

    if (!newAnnotation) {
      return null;
    }

    // Сохраняем аннотацию
    annotation.state.addAnnotation(newAnnotation);

    // Сразу показываем попап для ввода текста
    const config = this.configuration;
    if (config?.getTextCallback) {
      config.getTextCallback(
        (text: string) => {
          // Сохраняем текст в аннотацию
          newAnnotation.data.text = text || '';
          // Обновляем аннотацию
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
   * Создает аннотацию с одной точкой
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

    // Получаем referencedImageId
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

    // Создаем аннотацию с ОДНОЙ точкой (место клика)
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
        text: '', // Текст будет добавлен после ввода
        handles: {
          // Добавляем две одинаковые точки для совместимости с ArrowAnnotateTool
          // При рендеринге используем только первую точку
          points: [worldPos, worldPos],
          textBox: {
            worldPosition: worldPos, // Позиция текста = место клика
          },
        },
        cachedStats: {},
      },
    };

    return newAnnotation;
  }

  /**
   * Переопределяем isPointNearTool для работы с одной точкой
   * ArrowAnnotateTool ожидает две точки, а у нас только одна
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

    // Проверяем близость к точке клика (первая и единственная точка)
    const clickPoint = data.handles.points[0];
    const canvasPoint = viewport.worldToCanvas(clickPoint);

    const distance = Math.sqrt(
      Math.pow(canvasCoords[0] - canvasPoint[0], 2) + Math.pow(canvasCoords[1] - canvasPoint[1], 2)
    );

    // Также проверяем близость к textBox, если он есть
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
   * Переопределяем renderAnnotation - рисуем только текст, без стрелки и линии
   */
  renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: any): boolean => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    // Получаем все аннотации этого инструмента (Text)
    const annotations = annotation.state.getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return false;
    }

    // Получаем текущий imageId из viewport для фильтрации аннотаций
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

      // Фильтруем аннотации по текущему изображению
      // Показываем только те аннотации, которые относятся к текущему изображению
      if (currentImageId && metadata?.referencedImageId && metadata.referencedImageId !== currentImageId) {
        continue;
      }

      // Проверяем наличие точки (место клика)
      if (!data?.handles?.points?.length) {
        continue;
      }

      // Получаем стили для текста
      const styleSpecifierWithAnnotation = {
        ...styleSpecifier,
        annotationUID,
      };

      const textBoxOptions = this.getLinkedTextBoxStyle(styleSpecifierWithAnnotation, annotationItem);

      // Получаем текст из аннотации
      const textLines = data.text ? [data.text] : [''];

      // Точка клика - это центр текста
      const clickPoint = data.handles.points[0];

      // Инициализируем textBox, если его нет
      if (!data.handles.textBox) {
        data.handles.textBox = {};
      }

      // Определяем центр текста в мировых координатах
      // Используем сохраненный центр, если он есть (после первого рендеринга)
      // Иначе используем точку клика
      let textBoxCenterWorld: Types.Point3;
      if (data.handles.textBox.worldPosition) {
        // Используем сохраненный центр (стабильная позиция)
        textBoxCenterWorld = data.handles.textBox.worldPosition;
      } else {
        // При первом рендеринге используем точку клика как центр
        textBoxCenterWorld = clickPoint;
        data.handles.textBox.worldPosition = clickPoint;
      }

      // Преобразуем центр в canvas координаты
      const textBoxCenterCanvas = viewport.worldToCanvas(textBoxCenterWorld);

      // Получаем размер текста (кэшируем для оптимизации)
      let textWidth: number;
      let textHeight: number;

      const currentText = textLines.join('\n');
      if (data.handles.textBox.cachedSize &&
          data.handles.textBox.cachedText === currentText) {
        // Используем сохраненный размер
        textWidth = data.handles.textBox.cachedSize.width;
        textHeight = data.handles.textBox.cachedSize.height;
      } else {
        // Нужно получить размер текста
        // Временно рисуем текст в центре, чтобы получить его размер
        const tempBoundingBox = drawing.drawTextBox(
          svgDrawingHelper,
          `${annotationUID}-temp`,
          'temp',
          textLines,
          textBoxCenterCanvas,
          textBoxOptions
        );

        if (!tempBoundingBox) {
          continue;
        }

        textWidth = tempBoundingBox.width;
        textHeight = tempBoundingBox.height;

        // Сохраняем размер для следующего рендеринга
        data.handles.textBox.cachedSize = { width: textWidth, height: textHeight };
        data.handles.textBox.cachedText = currentText;
      }

      // ВСЕГДА вычисляем позицию левого верхнего угла так, чтобы центр был в textBoxCenterCanvas
      // Это гарантирует, что текст всегда центрирован относительно точки клика
      const textBoxPosition: Types.Point2 = [
        textBoxCenterCanvas[0] - textWidth / 2,
        textBoxCenterCanvas[1] - textHeight / 2,
      ];

      // Рисуем текст в правильной позиции (центр совпадает с точкой клика)
      const boundingBox = drawing.drawTextBox(
        svgDrawingHelper,
        annotationUID,
        'textBox',
        textLines,
        textBoxPosition,
        textBoxOptions
      );

      // Сохраняем boundingBox и обновляем центр, если нужно
      if (boundingBox && data.handles.textBox) {
        const { x: left, y: top, width, height } = boundingBox;

        // Сохраняем boundingBox
        data.handles.textBox.worldBoundingBox = {
          topLeft: viewport.canvasToWorld([left, top]),
          topRight: viewport.canvasToWorld([left + width, top]),
          bottomLeft: viewport.canvasToWorld([left, top + height]),
          bottomRight: viewport.canvasToWorld([left + width, top + height]),
        };

        // Вычисляем фактический центр текста и обновляем worldPosition
        // Это нужно для точности, так как реальный размер может немного отличаться
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const centerCanvas: Types.Point2 = [centerX, centerY];
        const actualCenterWorld = viewport.canvasToWorld(centerCanvas);

        // Обновляем центр только если он еще не был установлен или текст изменился
        if (!data.handles.textBox.worldPosition ||
            data.handles.textBox.cachedText !== currentText) {
          data.handles.textBox.worldPosition = actualCenterWorld;
        }
      }
    }

    return true;
  };
}

export default TextTool;
