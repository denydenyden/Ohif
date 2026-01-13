import { ArrowAnnotateTool } from '@cornerstonejs/tools';

/**
 * TextTool - полностью независимая копия ArrowAnnotateTool
 * Наследуется от ArrowAnnotateTool, но имеет свой toolName
 * Работает точно так же - со стрелкой и с текстом
 * Полностью независим от ArrowAnnotateTool
 */
class TextTool extends ArrowAnnotateTool {
  static toolName = 'Text';

  // Все остальные методы наследуются от ArrowAnnotateTool
  // Это полная копия функциональности, но с другим именем
}

export default TextTool;
