import { ArrowAnnotateTool, drawing } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';

/**
 * ArrowTool - только стрелка без текста
 * Наследуется от ArrowAnnotateTool, но показывает только стрелку и не вызывает текстовый callback
 */
class ArrowTool extends ArrowAnnotateTool {
  static toolName = 'Arrow';

  // Переопределяем handleSelectedCallback чтобы не вызывать getTextCallback
  handleSelectedCallback = (evt: Types.InteractionEventType, annotation: any) => {
    // Сохраняем оригинальную конфигурацию
    const originalConfig = { ...this.configuration };

    // Временно устанавливаем пустые callbacks чтобы родительский метод не вызывал диалог
    this.configuration = {
      ...this.configuration,
      getTextCallback: callback => {
        // Просто вызываем callback с пустой строкой, чтобы не показывать диалог
        callback('');
      },
      changeTextCallback: (data, eventDetails, callback) => {
        // Просто вызываем callback без изменений
        callback('');
      },
    };

    try {
      // Вызываем родительский метод
      const result = super.handleSelectedCallback(evt, annotation);
      return result;
    } finally {
      // Восстанавливаем оригинальную конфигурацию
      this.configuration = originalConfig;
    }
  };

  renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: any): void => {
    const { viewport } = enabledElement;
    const { element } = enabledElement;

    const annotations = this.filterInteractableAnnotationsForElement(element, enabledElement);

    if (!annotations?.length) {
      return;
    }

    const styleSpecifier = {
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const annotationUID = annotation.annotationUID;

      styleSpecifier.annotationUID = annotationUID;

      const style = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });
      // Всегда используем белый цвет для аннотаций (включая активные)
      const color = 'rgb(255, 255, 255)';
      // Всегда используем сплошные линии (не пунктирные)
      const lineDash = '';
      const lineWidth = style.lineWidth;

      const { data } = annotation;
      const { points } = data.handles;

      // Рендерим только стрелку, без текста
      // Обрабатываем как завершенные аннотации, так и preview (во время drag)
      if (points && points.length >= 2) {
        const canvasCoordinates = points.map(p => viewport.worldToCanvas(p));
        const start = canvasCoordinates[0];
        const end = canvasCoordinates[1];

        // Рисуем стрелку используя встроенный метод drawing.drawArrow
        // Порядок: конец стрелки, начало стрелки (как в DICOMSRDisplayTool)
        const arrowUID = `${annotationUID}-arrow`;
        const borderUID = `${annotationUID}-arrow-border`;
        const width = parseFloat(lineWidth) || 1.5;

        // Рисуем черную границу стрелки
        drawing.drawArrow(
          svgDrawingHelper,
          annotationUID,
          borderUID,
          end, // конец стрелки (куда указывает)
          start, // начало стрелки (откуда идет)
          {
            color: 'rgb(0, 0, 0)',
            width: width + 2,
          }
        );
        // Рисуем белую стрелку поверх
        drawing.drawArrow(
          svgDrawingHelper,
          annotationUID,
          arrowUID,
          end, // конец стрелки (куда указывает)
          start, // начало стрелки (откуда идет)
          {
            color,
            width: width,
          }
        );
      } else if (points && points.length === 1 && annotation.isPreview) {
        // Если только одна точка и это preview (во время drag), показываем точку
        const canvasCoordinate = viewport.worldToCanvas(points[0]);
        const pointUID = `${annotationUID}-point`;
        const borderUID = `${annotationUID}-point-border`;
        const width = parseFloat(lineWidth) || 1.5;

        // Рисуем черную границу точки
        drawing.drawCircle(svgDrawingHelper, annotationUID, borderUID, canvasCoordinate, 3, {
          color: 'rgb(0, 0, 0)',
          lineWidth: width + 2,
        });
        // Рисуем белую точку поверх
        drawing.drawCircle(svgDrawingHelper, annotationUID, pointUID, canvasCoordinate, 3, {
          color,
          lineWidth: width,
        });
      }
    }
  };
}

export default ArrowTool;
