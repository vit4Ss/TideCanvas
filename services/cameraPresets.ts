export interface CameraPreset {
    bodies: string[];
    lenses: string[];
    focalLengths: number[]; // mm
    apertures: string[]; // f-stops as display strings
}

// Common cinema-grade presets — feel free to extend
export const CAMERA_PRESETS: CameraPreset = {
    bodies: [
        'Panavision DXL2',
        'ARRI Alexa LF',
        'ARRI Alexa Mini',
        'RED V-Raptor 8K',
        'Sony Venice 2',
        'Blackmagic URSA 12K',
        'Canon EOS C500 II',
        'Sony FX9',
        'Leica M11',
        'Hasselblad X2D',
    ],
    lenses: [
        'Arri Signature Prime',
        'Cooke S7/i',
        'Zeiss Supreme Prime',
        'Leica Thalia',
        'Panavision Primo',
        'Tribe7 Blackwing7',
        'Sigma Cine FF Classic',
        'Atlas Orion Anamorphic',
        'Canon Sumire Prime',
        'Master Anamorphic',
    ],
    focalLengths: [14, 18, 24, 28, 35, 50, 75, 85, 100, 135, 200],
    apertures: ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16'],
};

export interface CameraSelection {
    body: string;
    lens: string;
    focal: number;
    aperture: string;
}

export const DEFAULT_CAMERA: CameraSelection = {
    body: CAMERA_PRESETS.bodies[0],
    lens: CAMERA_PRESETS.lenses[0],
    focal: 35,
    aperture: 'f/4',
};

export const formatCameraPrompt = (c: CameraSelection): string =>
    `Shot on ${c.body} with ${c.lens} ${c.focal}mm at ${c.aperture}`;
