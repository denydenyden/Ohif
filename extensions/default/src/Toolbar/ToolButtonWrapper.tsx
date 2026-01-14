import React from 'react';
import { useIconPresentation, Icons, Button, cn } from '@ohif/ui-next';

export default function ToolButtonWrapper(props) {
  const { IconContainer, containerProps } = useIconPresentation();

  // Exclude non-DOM props from props
  const {
    evaluate,
    visible,
    isActive,
    evaluateProps,
    ...domProps
  } = props;

  const Icon = <Icons.ByName name={props.icon} />;

  // Merge className with active state if needed
  // className from evaluator should already include active styles, but we ensure isActive is respected
  const mergedClassName = cn(
    props.className,
    isActive && 'bg-highlight text-background hover:!bg-highlight/80'
  );

  return (
    <div>
      {IconContainer ? (
        <IconContainer
          disabled={props.disabled}
          className={mergedClassName}
          {...domProps}
          {...containerProps}
        >
          {Icon}
        </IconContainer>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          disabled={props.disabled}
          className={mergedClassName}
        >
          {Icon}
        </Button>
      )}
    </div>
  );
}

export { ToolButtonWrapper };
