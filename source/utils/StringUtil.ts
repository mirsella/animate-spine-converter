export class StringUtil {
    public static simplify(value:string):string {
        if (!value) return 'unnamed';
        
        // Fix for multiple underscores and naming collisions:
        // 1. Replace illegal path characters with underscores
        // 2. But DO NOT aggressively lowercase or strip everything if it causes collision.
        // Actually, the user says "multiples underscore break them".
        // Maybe "a__b" becomes "a_b"? Or maybe the regex `/[\/\-. ]+/gi` is too broad?
        // If I have "part_sub_part", the regex matches... nothing? 
        // Wait, the regex matches '/', '-', '.', ' '.
        // Underscore is NOT in the regex.
        // So "part_sub_part" remains "part_sub_part".
        // If the user says it breaks, maybe Spine doesn't like it?
        // Or maybe 'simplify' is NOT the problem, but 'createAttachmentName' using libraryItem name.
        
        // Let's ensure we sanitize strictly but keep underscores if they are valid.
        // Spine allows underscores.
        
        // Let's replace only truly invalid chars.
        const regex = /[\/\-. ]+/g; 
        
        let simplified = value.replace(regex, '_');
        
        // Collapse multiple underscores to one? "a___b" -> "a_b"
        simplified = simplified.replace(/_+/g, '_');
        
        // Trim leading/trailing underscores
        simplified = simplified.replace(/^_|_$/g, '');
        
        return simplified.toLowerCase();
    }
}
