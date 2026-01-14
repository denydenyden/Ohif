import { Types } from '@ohif/core';
import { id } from './id';
import getCommandsModule from './getCommandsModule';
import getToolbarModule from './getToolbarModule';

const extension: Types.Extensions.Extension = {
  id,
  getCommandsModule,
  getToolbarModule,
};

export default extension;
