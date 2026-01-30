import { Logger } from '../logger/Logger';

export class StringUtil {
    public static simplify(value:string):string {
        if (!value) return 'unnamed';
        
        // Lowercase first
        let result = value.toLowerCase();
        const original = result;

        // Manual replacement of common illegal characters to be safe in old JSFL
        const searchChars = ["/", "\\", ".", "-", " ", "\t", "\n", "\r", "\xa0"];
        for (let i = 0; i < searchChars.length; i++) {
            const char = searchChars[i];
            while (result.indexOf(char) !== -1) {
                result = result.replace(char, "_");
            }
        }

        // AGGRESSIVE SANITIZATION: Replace anything that is not a-z, 0-9, or _
        let cleaned = "";
        for (let i = 0; i < result.length; i++) {
            const char = result.charAt(i);
            const code = result.charCodeAt(i);
            
            // Allow a-z (97-122), 0-9 (48-57), and _ (95)
            if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95) {
                cleaned += char;
            } else {
                // Log the character code to understand what we are replacing
                Logger.trace(`[Naming] Sanitize: Character '${char}' (code: 0x${code.toString(16)}) in '${original}' replaced with '_'`);
                cleaned += "_";
            }
        }
        result = cleaned;

        // Collapse multiple underscores
        while (result.indexOf("__") !== -1) {
            result = result.replace("__", "_");
        }

        // Trim leading/trailing underscores
        if (result.charAt(0) === "_") result = result.substring(1);
        if (result.charAt(result.length - 1) === "_") result = result.substring(0, result.length - 1);
        
        if (result === "") return "unnamed";
        return result;
    }
}
