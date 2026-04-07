# Tool Expand/Collapse Animation Implementation

## Overview

Added smooth expand/collapse animations to all tool call blocks, improving user experience.

## Animation Features

### CSS Animation Classes
```css
.tool-expand-content {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.25s ease,
              transform 0.25s ease;
}

.tool-expand-content.expanded {
  max-height: 2000px;
  opacity: 1;
  transform: translateY(0);
}
```

### Animation Effects
| Property | Expand | Collapse | Duration |
|----------|--------|----------|----------|
| **max-height** | 0 → 2000px | 2000px → 0 | 300ms |
| **opacity** | 0 → 1 | 1 → 0 | 250ms |
| **transform** | -8px → 0 | 0 → -8px | 250ms |

### Easing Function
- `cubic-bezier(0.4, 0, 0.2, 1)` - Standard Material Design easing
- Provides natural smooth acceleration/deceleration

## Applicable Components

All tool execution components updated with animation support:
- ✅ `GenericToolCall` - Generic tools
- ✅ `BashExecution` - Bash commands
- ✅ `ReadExecution` - File reading
- ✅ `WriteExecution` - File writing
- ✅ `EditExecution` - File editing

## Usage

Animation state handled internally by components, no additional configuration needed:

```tsx
<div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
  {/* Content */}
</div>
```

## Performance Optimization
- Use `will-change` hint for browser optimization
- `max-height` uses sufficiently large value to avoid content truncation
- Animations only affect `opacity` and `transform`, triggering GPU acceleration

## Design Inspiration
> 「**What matters is not speed, but rhythm.**」— *Naruto*

Animations shouldn't be as fast as possible, but should have appropriate rhythm. The 300ms expand time is long enough for people to perceive the change, but not too slow.

## Testing Suggestions
1. Click tool header, observe if expand animation is smooth
2. Quickly toggle expand/collapse, check if animation is continuous
3. Test animation effects with different content lengths
4. Check mobile performance
