export class SpineImage {
    public constructor(
        public path: string,
        public width: number,
        public height: number,
        public scale: number,
        public x: number,
        public y: number,
        public imageCenterOffsetX: number = 0,
        public imageCenterOffsetY: number = 0
    ) {}
}
