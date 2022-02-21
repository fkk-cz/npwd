import { PhotoEvents } from '../../typings/photo';
import { Delay } from '../utils/fivem';
import { sendCameraEvent, sendMessage } from '../utils/messages';
import { PhoneEvents } from '../../typings/phone';
import { ClUtils } from './client';
import { config } from './cl_config';
import { animationService } from './animations/animation.controller';
import { RegisterNuiCB, RegisterNuiProxy } from './cl_utils';

const SCREENSHOT_BASIC_TOKEN = GetConvar('SCREENSHOT_BASIC_TOKEN', 'none');
const exp = global.exports;

let inCameraMode = false;
let scaleformCamera: number = null;
let scaleformButton: number = null;
let depthField = false;
let drawGridLines = false;
let filterIndex = 0;
let filterNames: string[] = [
  'No_Filter',
  'phone_cam1',
  'phone_cam2',
  'phone_cam3',
  'phone_cam4',
  'phone_cam5',
  'phone_cam6',
  'phone_cam7',
  'phone_cam8',
  'phone_cam9',
  'phone_cam10',
  'phone_cam11',
  'phone_cam12',
];

function InsertScaleformButton(i: number, controlIndex: number, scString: string) {
  BeginScaleformMovieMethod(scaleformButton, 'SET_DATA_SLOT');
  ScaleformMovieMethodAddParamInt(i);
  ScaleformMovieMethodAddParamPlayerNameString(GetControlInstructionalButton(0, controlIndex, 1));
  BeginTextCommandScaleformString(scString);
  EndTextCommandScaleformString();
  EndScaleformMovieMethod();
}

function DrawCameraInstructionalButtons(frontCam: boolean) {
  BeginScaleformMovieMethod(scaleformButton, 'SET_CLEAR_SPACE');
  ScaleformMovieMethodAddParamInt(200);
  EndScaleformMovieMethod();

  BeginScaleformMovieMethod(scaleformButton, 'SET_DATA_SLOT_EMPTY');
  ScaleformMovieMethodAddParamInt(3);
  EndScaleformMovieMethod();

  InsertScaleformButton(0, 176, 'CELL_280');
  InsertScaleformButton(1, 177, 'CELL_281');
  InsertScaleformButton(2, 184, frontCam ? 'CELL_SP_2NP_XB' : 'CELL_SP_1NP_XB');
  InsertScaleformButton(3, 183, 'CELL_GRID');
  InsertScaleformButton(4, 1, 'CELL_285');
  InsertScaleformButton(5, 173, 'CELL_FILTER');
  InsertScaleformButton(6, 175, 'CELL_ACCYC');
  InsertScaleformButton(7, 185, 'CELL_DEPTH');

  BeginScaleformMovieMethod(scaleformButton, 'DRAW_INSTRUCTIONAL_BUTTONS');
  ScaleformMovieMethodAddParamInt(0);
  EndScaleformMovieMethod();

  DrawScaleformMovieFullscreen(scaleformButton, 255, 255, 255, 255, 0);
}

function closePhoneTemp() {
  SetNuiFocus(false, false);
  sendMessage('PHONE', PhoneEvents.SET_VISIBILITY, false);

  SetScaleformMovieAsNoLongerNeeded(scaleformCamera);
  SetScaleformMovieAsNoLongerNeeded(scaleformButton);
}

async function openPhoneTemp() {
  scaleformCamera = RequestScaleformMovie('camera_gallery');
  while (!HasScaleformMovieLoaded(scaleformCamera)) await Delay(0);

  scaleformButton = RequestScaleformMovie('instructional_buttons');
  while (!HasScaleformMovieLoaded(scaleformButton)) await Delay(0);

  SetNuiFocus(true, true);
  sendMessage('PHONE', PhoneEvents.SET_VISIBILITY, true);
}

function CellFrontCamActivate(activate: boolean) {
  return Citizen.invokeNative('0x2491A93618B7D838', activate);
}

const displayHelperText = () => {
  BeginTextCommandDisplayHelp('THREESTRINGS');
  AddTextComponentString('Exit Camera Mode: ~INPUT_CELLPHONE_CANCEL~');
  AddTextComponentString('Toggle Front/Back: ~INPUT_PHONE~');
  AddTextComponentString('Take Picture: ~INPUT_CELLPHONE_SELECT~');
  EndTextCommandDisplayHelp(0, true, false, -1);
};

// TODO: The flow here seems a little convuluted, we need to take a look at it.
RegisterNuiCB<void>(PhotoEvents.TAKE_PHOTO, async (_, cb) => {
  await animationService.openCamera();
  emit('npwd:disableControlActions', false);
  // Create Phone Prop
  let frontCam = false;
  CreateMobilePhone(1);
  // Active Camera Change
  CellCamActivate(true, true);
  // Hide phone from rendering temporary
  closePhoneTemp();
  SetNuiFocus(false, false);

  inCameraMode = true;

  // We want to emit this event for UI handling in other resources
  // We hide nothing in NPWD by default
  emit(PhotoEvents.NPWD_PHOTO_MODE_STARTED);

  while (inCameraMode) {
    await Delay(0);

    // Arrow Up Key, Toggle Front/Back Camera
    if (IsControlJustPressed(1, 27)) {
      PlaySoundFrontend(-1, 'Menu_Navigate', 'Phone_SoundSet_Prologue', true);
      frontCam = !frontCam;
      CellFrontCamActivate(frontCam);
    } else if (IsControlJustPressed(1, 185)) {
      // Depth of field
      PlaySoundFrontend(-1, 'Menu_Navigate', 'Phone_SoundSet_Prologue', true);
      depthField = !depthField;
    } else if (IsControlJustPressed(1, 183)) {
      // Grid lines
      PlaySoundFrontend(-1, 'Menu_Navigate', 'Phone_SoundSet_Prologue', true);
      drawGridLines = !drawGridLines;
    } else if (IsControlJustPressed(1, 173)) {
      // Filters
      PlaySoundFrontend(-1, 'Menu_Navigate', 'Phone_SoundSet_Prologue', true);
      filterIndex += 1;
      if (filterIndex == 13) {
        filterIndex = 0;
      }

      SetTimecycleModifier(filterNames[filterIndex]);
    } else if (IsControlJustPressed(1, 176)) {
      // Take photo
      PlaySoundFrontend(-1, 'Camera_Shoot', 'Phone_SoundSet_Prologue', true);
      const resp = await handleTakePicture();
      cb(resp);
      break;
    } else if (IsControlJustPressed(1, 177)) {
      // Exit phone
      await handleCameraExit();
      break;
    }

    // displayHelperText();

    SetScriptGfxDrawOrder(4);

    BeginScaleformMovieMethod(scaleformCamera, 'SHOW_PHOTO_FRAME');
    ScaleformMovieMethodAddParamInt(drawGridLines ? 1 : 0);
    EndScaleformMovieMethod();

    Citizen.invokeNative('0xA2CCBE62CD4C91A4', SetMobilePhoneUnk(depthField) as unknown);

    BeginScaleformMovieMethod(scaleformCamera, 'DISPLAY_VIEW');
    ScaleformMovieMethodAddParamInt(2);
    EndScaleformMovieMethod();

    DrawScaleformMovie(scaleformCamera, 0.5, 0.5, 1.0, 1.0, 255, 255, 255, 255, 0);

    DrawCameraInstructionalButtons(frontCam);

    HideHudComponentThisFrame(6);
    HideHudComponentThisFrame(7);
    HideHudComponentThisFrame(8);
    HideHudComponentThisFrame(9);
    HideHudComponentThisFrame(19);
  }

  if (filterIndex != 0) {
    SetTimecycleModifier('');
    ClearTimecycleModifier();
    filterIndex = 0;
  }

  ClearHelp(true);
  // We can now signal to other resources for ending photo mode
  // and redisplaying HUD components
  emit(PhotoEvents.NPWD_PHOTO_MODE_ENDED);

  emit('npwd:disableControlActions', true);
  await animationService.closeCamera();
});

const handleTakePicture = async () => {
  // Wait a frame so we don't draw the display helper text
  ClearHelp(true);
  await Delay(0);
  /*
   * If we don't do this janky work around players get stuck in their camera
   * until the entire server callback has happened, which doesn't matter for
   * people with fast internet but a lot of people still have slow internet
   */
  setTimeout(() => {
    DestroyMobilePhone();
    CellCamActivate(false, false);
    openPhoneTemp();
    animationService.openPhone();
    emit('npwd:disableControlActions', true);
  }, 200);
  const resp = await takePhoto();
  inCameraMode = false;
  return resp;
};

const handleCameraExit = async () => {
  sendCameraEvent(PhotoEvents.CAMERA_EXITED);
  ClearHelp(true);
  await animationService.closeCamera();
  emit('npwd:disableControlActions', true);
  DestroyMobilePhone();
  CellCamActivate(false, false);
  openPhoneTemp();
  inCameraMode = false;
};

const takePhoto = () =>
  new Promise((res, rej) => {
    // Return and log error if screenshot basic token not found
    if (SCREENSHOT_BASIC_TOKEN === 'none' && config.images.useAuthorization) {
      return console.error('Screenshot basic token not found. Please set in server.cfg');
    }
    exp['screenshot-basic'].requestScreenshotUpload(
      config.images.url,
      config.images.type,
      {
        encoding: config.images.imageEncoding,
        headers: {
          authorization: config.images.useAuthorization
            ? `${config.images.authorizationPrefix} ${SCREENSHOT_BASIC_TOKEN}`
            : undefined,
          'content-type': config.images.contentType,
        },
      },
      async (data: any) => {
        try {
          let parsedData = JSON.parse(data);
          for (const index of config.images.returnedDataIndexes) parsedData = parsedData[index];
          const resp = await ClUtils.emitNetPromise(PhotoEvents.UPLOAD_PHOTO, parsedData);
          res(resp);
        } catch (e) {
          rej(e.message);
        }
      },
    );
  });

RegisterNuiProxy(PhotoEvents.FETCH_PHOTOS);
RegisterNuiProxy(PhotoEvents.DELETE_PHOTO);
