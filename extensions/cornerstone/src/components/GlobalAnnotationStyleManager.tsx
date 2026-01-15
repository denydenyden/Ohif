import { useEffect } from 'react';

/**
 * Global Annotation Style Manager
 * Applies user preference annotation styles to all viewports
 */
export function GlobalAnnotationStyleManager() {
  useEffect(() => {
    const updateAllAnnotationStyles = () => {
      // Read from local storage or use defaults
      const fontSize = Number(localStorage.getItem('ohif-annotation-font-size')) || 14;
      const lineWidth = Number(localStorage.getItem('ohif-annotation-line-width')) || 2;

      console.log('[GlobalAnnotationStyles] Updating all viewports:', { fontSize, lineWidth });

      // Find all viewport SVG layers
      const allViewports = document.querySelectorAll('[data-viewportid]');
      let totalTextUpdated = 0;
      let totalLinesUpdated = 0;

      allViewports.forEach(viewport => {
        const svgLayer = viewport.querySelector('svg.svg-layer') as SVGElement;
        if (!svgLayer) return;

        // Apply font size to all text elements
        const textElements = svgLayer.querySelectorAll('text');
        textElements.forEach(textEl => {
          textEl.setAttribute('font-size', `${fontSize}px`);
          (textEl as unknown as HTMLElement).style.setProperty('font-size', `${fontSize}px`, 'important');
          totalTextUpdated++;
        });

        // Apply line width to all line/path elements
        const lineElements = svgLayer.querySelectorAll('line, path, polyline, polygon');
        lineElements.forEach(el => {
          el.setAttribute('stroke-width', String(lineWidth));
          (el as unknown as HTMLElement).style.setProperty('stroke-width', `${lineWidth}px`, 'important');
          totalLinesUpdated++;
        });
      });

      if (totalTextUpdated > 0 || totalLinesUpdated > 0) {
        console.log('[GlobalAnnotationStyles] Updated elements:', {
          viewports: allViewports.length,
          text: totalTextUpdated,
          lines: totalLinesUpdated
        });
      }
    };

    // Initial update
    updateAllAnnotationStyles();

    // Listen for changes from preferences
    window.addEventListener('annotation-settings-changed', updateAllAnnotationStyles);

    // Update periodically to catch new annotations
    const interval = setInterval(updateAllAnnotationStyles, 1000);

    return () => {
      window.removeEventListener('annotation-settings-changed', updateAllAnnotationStyles);
      clearInterval(interval);
    };
  }, []);

  return null; // This is a logic-only component
}
