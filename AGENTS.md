# AGENTS.md - Development Guidelines

## Project Overview

TypeScript-to-JSFL converter for Adobe Animate to Spine animation export. Compiles TypeScript source into a single JSFL (JavaScript Flash) script executable in Adobe Animate.

## Build Commands

```bash
# Compile TypeScript to JSFL (main build command)
npm run compile

# Install dependencies
npm install
```

**Note**: No test framework or linter is currently configured. Testing is done by running the generated `converter.jsfl` in Adobe Animate.

## Project Structure

```
source/
├── index.ts              # Entry point - defines export configuration
├── core/                 # Core conversion logic
│   ├── Converter.ts      # Main conversion orchestrator
│   ├── ConverterContext.ts
│   └── ConverterContextGlobal.ts
├── spine/                # Spine format definitions
│   ├── formats/          # Version-specific formatters (V3_8, V4_0, V4_1, V4_2)
│   ├── SpineAnimation.ts
│   ├── SpineBone.ts
│   └── ...
├── animate/              # Adobe Animate types and wrappers
├── utils/                # Utility functions
│   ├── ConvertUtil.ts
│   ├── StringUtil.ts
│   └── MathUtil.ts
└── logger/               # Logging utilities
```

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES5 (for JSFL compatibility)
- **Strict mode**: Enabled
- **Module system**: CommonJS
- **Source maps**: Disabled

### Naming Conventions

- **Classes**: PascalCase (e.g., `SpineBone`, `ConverterContext`)
- **Interfaces**: PascalCase with `I` prefix (e.g., `IColorData`, `IFrameData`)
- **Methods/Properties**: camelCase (e.g., `getLibraryItem`, `firstFrame`)
- **Private members**: Prefix with underscore (e.g., `_document`, `_workingPath`)
- **Constants**: UPPER_SNAKE_CASE for true constants

### Code Formatting

- **Indentation**: 4 spaces
- **Line endings**: Unix (LF)
- **Max line length**: ~120 characters
- **Braces**: Same line for control structures, new line for class/function declarations

### Type Annotations

- Always specify return types on public methods
- Use explicit types for function parameters
- Use `readonly` for immutable properties
- Prefer interfaces over type aliases for object shapes

### Imports

```typescript
// Group imports: external first, then internal
import { SpineFormat } from "./SpineFormat";
import { SpineBone } from "../SpineBone";
import { StringUtil } from "../../utils/StringUtil";

// Use named imports with curly braces
import { IConverterOptions } from "../types/IConverterOptions";
```

### Class Structure

```typescript
export class MyClass {
  // Public properties first
  public readonly version: string = "1.0.0";

  // Private properties
  private _internalState: number = 0;

  // Constructor
  constructor(options: IOptions) {
    // initialization
  }

  // Public methods
  public process(): void {
    // implementation
  }

  // Private methods
  private _helper(): void {
    // implementation
  }
}
```

### Error Handling

- Use explicit error messages with context
- Validate inputs at function boundaries
- Use TypeScript's strict null checks to prevent null reference errors
- Log errors through the Logger utility before throwing

### JSFL Compatibility Notes

- Target ES5 for Adobe Animate JSFL environment
- Avoid modern JavaScript features (arrow functions in some contexts, spread operator, etc.)
- Be aware that JSFL runs in an older JavaScript engine
- Test compiled output in Adobe Animate after making changes

### Logging

Use the Logger utility for all output:

```typescript
import { Logger } from "../logger/Logger";

Logger.log("Message");
Logger.error("Error details");
```

## Common Tasks

### Adding a New Spine Format Version

1. Create file: `source/spine/formats/SpineFormatV4_X_00.ts`
2. Extend previous version and set `version` property
3. Update `index.ts` to instantiate the new format class
4. Run `npm run compile`

### Modifying Core Conversion Logic

- Main logic is in `source/core/Converter.ts`
- Context/state management in `ConverterContext.ts` and `ConverterContextGlobal.ts`
- Utility functions in `source/utils/`

### Testing Changes

1. Run `npm run compile`
2. Load generated `converter.jsfl` in Adobe Animate
3. Test with actual .fla files
4. Check generated Spine JSON output
