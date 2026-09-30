import exteriorFacadeImage from '../assets/images/aradad_exterior_facade_1790622689884.jpg';
import heroBackgroundImage from '../assets/images/image.png';
import livingRoomImage from '../assets/images/aradad_living_room_1790622701630.jpg';
import bedroomSuiteImage from '../assets/images/aradad_bedroom_suite_1790622712187.jpg';
import modernKitchenImage from '../assets/images/aradad_modern_kitchen_1790622722236.jpg';
import balconyViewImage from '../assets/images/aradad_balcony_view_1790622732987.jpg';

export const EXTERIOR_FACADE_IMAGE = exteriorFacadeImage;
export const HERO_BACKGROUND_IMAGE = heroBackgroundImage;
export const LIVING_ROOM_IMAGE = livingRoomImage;
export const BEDROOM_SUITE_IMAGE = bedroomSuiteImage;
export const MODERN_KITCHEN_IMAGE = modernKitchenImage;
export const BALCONY_VIEW_IMAGE = balconyViewImage;

const legacyImageUrls: Record<string, string> = {
  '/src/assets/images/aradad_exterior_facade_1790622689884.jpg': EXTERIOR_FACADE_IMAGE,
  '/src/assets/images/aradad_living_room_1790622701630.jpg': LIVING_ROOM_IMAGE,
  '/src/assets/images/aradad_bedroom_suite_1790622712187.jpg': BEDROOM_SUITE_IMAGE,
  '/src/assets/images/aradad_modern_kitchen_1790622722236.jpg': MODERN_KITCHEN_IMAGE,
  '/src/assets/images/aradad_balcony_view_1790622732987.jpg': BALCONY_VIEW_IMAGE,
};

export function resolveImageUrl(imageUrl: string): string {
  return legacyImageUrls[imageUrl] || imageUrl;
}

export function resolveImageUrls(images: unknown): string[] {
  return Array.isArray(images)
    ? images.filter((image): image is string => typeof image === 'string').map(resolveImageUrl)
    : [];
}