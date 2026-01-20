import { ArrowAnnotateTool, drawing, annotation } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';

/**
 * ArrowTool - только стрелка без текста
 * Наследуется от ArrowAnnotateTool, но показывает только стрелку и не вызывает текстовый callback
 */
class ArrowTool extends ArrowAnnotateTool {
  static toolName = 'Arrow';

  // Переопределяем handleSelectedCallback чтобы не вызывать getTextCallback
  handleSelectedCallback = (evt: Types.InteractionEventType, annotationItem: any) => {
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
      const result = super.handleSelectedCallback(evt, annotationItem, this.getToolName());
      return result;
    } finally {
      // Восстанавливаем оригинальную конфигурацию
      this.configuration = originalConfig;
    }
  };

  /**
   * Рисует стрелку с кастомным размером наконечника и масштабированием
   */
  private _drawCustomArrow(
    svgDrawingHelper: any,
    annotationUID: string,
    arrowUID: string,
    start: Types.Point2,
    end: Types.Point2,
    options: { color: string; width: number },
    zoom: number
  ) {
    const { color, width } = options;
    // Увеличенный размер наконечника (базовый 15 вместо 10) + масштабирование
    const headLength = 15 * zoom;
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);

    // Рисуем основную линию
    drawing.drawLine(svgDrawingHelper, annotationUID, arrowUID, start, end, {
      color,
      width,
    });

    // Рисуем "усики" стрелки (наконечник)
    // Используем угол PI/6 (30 градусов) для более выразительного наконечника
    const headAngle = Math.PI / 6;

    const firstLineStart: Types.Point2 = [
      end[0] - headLength * Math.cos(angle - headAngle),
      end[1] - headLength * Math.sin(angle - headAngle),
    ];

    const secondLineStart: Types.Point2 = [
      end[0] - headLength * Math.cos(angle + headAngle),
      end[1] - headLength * Math.sin(angle + headAngle),
    ];

    drawing.drawLine(svgDrawingHelper, annotationUID, `${arrowUID}-head1`, firstLineStart, end, {
      color,
      width,
    });
    drawing.drawLine(svgDrawingHelper, annotationUID, `${arrowUID}-head2`, secondLineStart, end, {
      color,
      width,
    });
  }

  renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: any): boolean => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    const annotations = annotation.state.getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return false;
    }

    const styleSpecifier = {
      toolName: this.getToolName(),
      viewportId: viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotationItem = annotations[i] as any;
      const annotationUID = annotationItem.annotationUID;

      const style = this.getLinkedTextBoxStyle({ ...styleSpecifier, annotationUID }, annotationItem);

      // Всегда используем белый цвет для аннотаций (включая активные)
      const color = 'rgb(255, 255, 255)';
      const lineWidth = style.lineWidth;

      const { data } = annotationItem;
      const { points } = data.handles;

      // Рендерим только стрелку, без текста
      if (points && points.length >= 2) {
        const canvasCoordinates = points.map(p => viewport.worldToCanvas(p));
        const start = canvasCoordinates[0];
        const end = canvasCoordinates[1];

        const arrowUID = `${annotationUID}-arrow`;
        const borderUID = `${annotationUID}-arrow-border`;

        // Масштабируем толщину линии в зависимости от зума
        const zoom = viewport.getZoom();
        const baseWidth = parseFloat(lineWidth as string) || 1.5;
        const width = baseWidth * zoom;

        // Рисуем черную границу стрелки (масштабируем и толщину границы)
        this._drawCustomArrow(
          svgDrawingHelper,
          annotationUID,
          borderUID,
          start,
          end,
          {
            color: 'rgb(0, 0, 0)',
            width: width + 2 * zoom,
          },
          zoom
        );
        // Рисуем белую стрелку поверх
        this._drawCustomArrow(
          svgDrawingHelper,
          annotationUID,
          arrowUID,
          start,
          end,
          {
            color,
            width: width,
          },
          zoom
        );
      } else if (points && points.length === 1 && annotationItem.isPreview) {
        // Если только одна точка и это preview (во время drag), показываем точку
        const canvasCoordinate = viewport.worldToCanvas(points[0]);
        const pointUID = `${annotationUID}-point`;
        const borderUID = `${annotationUID}-point-border`;

        // Масштабируем толщину линии в зависимости от зума
        const zoom = viewport.getZoom();
        const baseWidth = parseFloat(lineWidth as string) || 1.5;
        const width = baseWidth * zoom;

        // Рисуем черную границу точки
        drawing.drawCircle(svgDrawingHelper, annotationUID, borderUID, canvasCoordinate, 3 * zoom, {
          color: 'rgb(0, 0, 0)',
          lineWidth: width + 2 * zoom,
        });
        // Рисуем белую точку поверх
        drawing.drawCircle(svgDrawingHelper, annotationUID, pointUID, canvasCoordinate, 3 * zoom, {
          color,
          lineWidth: width,
        });
      }
    }

    return true;
  };
}

export default ArrowTool;
