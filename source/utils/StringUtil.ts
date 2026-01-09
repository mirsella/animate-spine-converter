export class StringUtil {
    public static simplify(value:string):string {
        // Do not strip the path. Replace slashes and other chars with underscores to ensure uniqueness.
        // This prevents collisions between "folderA/item" and "folderB/item".
        const regex = /[\/\-. ]+/gi;

        return (
            value.replace(regex, '_')
                .toLowerCase()
        );
    }
}
