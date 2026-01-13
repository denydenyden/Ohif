import {
  AngleTool,
  annotation,
  ArrowAnnotateTool,
  BidirectionalTool,
  CobbAngleTool,
  EllipticalROITool,
  CircleROITool,
  LengthTool,
  PlanarFreehandROITool,
  RectangleROITool,
} from '@cornerstonejs/tools';
import { Types } from '@ohif/core';

import DICOMSRDisplayTool from './tools/DICOMSRDisplayTool';
import addToolInstance from './utils/addToolInstance';
import toolNames from './tools/toolNames';

/**
 * @param {object} configuration
 */
export default function init({
  configuration = {},
  servicesManager,
}: Types.Extensions.ExtensionParams): void {
  addToolInstance(toolNames.DICOMSRDisplay, DICOMSRDisplayTool);
  addToolInstance(toolNames.SRLength, LengthTool);
  addToolInstance(toolNames.SRBidirectional, BidirectionalTool);
  addToolInstance(toolNames.SREllipticalROI, EllipticalROITool);
  addToolInstance(toolNames.SRCircleROI, CircleROITool);
  addToolInstance(toolNames.SRArrowAnnotate, ArrowAnnotateTool);
  addToolInstance(toolNames.SRAngle, AngleTool);
  addToolInstance(toolNames.SRPlanarFreehandROI, PlanarFreehandROITool);
  addToolInstance(toolNames.SRRectangleROI, RectangleROITool);

  // TODO - fix the SR display of Cobb Angle, as it joins the two lines
  addToolInstance(toolNames.SRCobbAngle, CobbAngleTool);

  // Modify annotation tools to use white color and solid lines (no dashes)
  const solidLineStyle = {
    color: 'rgb(255, 255, 255)',
    textBoxColor: 'rgb(255, 255, 255)',
    lineDash: '',
  };
  annotation.config.style.setToolGroupToolStyles('SRToolGroup', {
    [toolNames.DICOMSRDisplay]: solidLineStyle,
    SRLength: solidLineStyle,
    SRBidirectional: solidLineStyle,
    SREllipticalROI: solidLineStyle,
    SRCircleROI: solidLineStyle,
    SRArrowAnnotate: solidLineStyle,
    SRCobbAngle: solidLineStyle,
    SRAngle: solidLineStyle,
    SRPlanarFreehandROI: solidLineStyle,
    SRRectangleROI: solidLineStyle,
    global: {},
  });
}
