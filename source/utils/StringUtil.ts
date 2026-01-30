export class StringUtil {
    public static simplify(value:string):string {
        if (!value) return 'unnamed';
        
        // Lowercase first
        let result = value.toLowerCase();

        // Manual replacement of common illegal characters to be safe in old JSFL
        // Replace slashes, dots, hyphens, and whitespace (including non-breaking space) with underscore
        const searchChars = ["/", "\\", ".", "-", " ", "\t", "\n", "\r", "\xa0"];
        for (let i = 0; i < searchChars.length; i++) {
            const char = searchChars[i];
            while (result.indexOf(char) !== -1) {
                result = result.replace(char, "_");
            }
        }

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
