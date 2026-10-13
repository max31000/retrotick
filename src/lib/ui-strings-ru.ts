// Russian (ru-RU) overrides for the strings an emulated program shows through system UI
// (message box buttons, application error). Everything else falls back to English.
import type { UiStrings } from './ui-strings';

export function makeRussianStrings(en: UiStrings): UiStrings {
  return {
    ...en,
    cancel: 'Отмена',
    ok: 'ОК',
    yes: 'Да',
    no: 'Нет',
    abort: 'Прервать',
    retry: 'Повтор',
    ignore: 'Пропустить',
    applicationError: 'Ошибка приложения',
    crashMessage: 'Ошибка в приложении {0}. Приложение будет закрыто.',
    clickOkToTerminate: 'Нажмите кнопку «ОК» для завершения программы.',
  };
}
