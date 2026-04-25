import { ScreenManager } from './screens/screenManager';

const canvas = document.getElementById('gameCanvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected #gameCanvas to exist');
}

const screenManager = new ScreenManager();
void canvas;
void screenManager;
