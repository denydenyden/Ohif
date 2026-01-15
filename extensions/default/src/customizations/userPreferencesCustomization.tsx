import React, { useMemo, useState, useEffect } from 'react';
import { useSystem, hotkeys as hotkeysModule } from '@ohif/core';
import { UserPreferencesModal, FooterAction } from '@ohif/ui-next';
import { useTranslation } from 'react-i18next';
import i18n from '@ohif/i18n';

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ohif/ui-next';

const { availableLanguages, defaultLanguage, currentLanguage: currentLanguageFn } = i18n;

interface HotkeyDefinition {
  keys: string;
  label: string;
}

interface HotkeyDefinitions {
  [key: string]: HotkeyDefinition;
}

function UserPreferencesModalDefault({ hide }: { hide: () => void }) {
  const { hotkeysManager } = useSystem();
  const { t, i18n: i18nextInstance } = useTranslation('UserPreferencesModal');

  const { hotkeyDefinitions = {}, hotkeyDefaults = {} } = hotkeysManager;

  const fallbackHotkeyDefinitions = useMemo(
    () =>
      hotkeysManager.getValidHotkeyDefinitions(
        hotkeysModule.defaults.hotkeyBindings
      ) as HotkeyDefinitions,
    [hotkeysManager]
  );

  useEffect(() => {
    if (!Object.keys(hotkeyDefaults).length) {
      hotkeysManager.setDefaultHotKeys(hotkeysModule.defaults.hotkeyBindings);
    }

    if (!Object.keys(hotkeyDefinitions).length) {
      hotkeysManager.setHotkeys(fallbackHotkeyDefinitions);
    }
  }, [hotkeysManager, hotkeyDefaults, hotkeyDefinitions, fallbackHotkeyDefinitions]);

  const resolvedHotkeyDefaults = Object.keys(hotkeyDefaults).length
    ? (hotkeyDefaults as HotkeyDefinitions)
    : fallbackHotkeyDefinitions;

  const initialHotkeyDefinitions = Object.keys(hotkeyDefinitions).length
    ? (hotkeyDefinitions as HotkeyDefinitions)
    : resolvedHotkeyDefaults;

  const currentLanguage = currentLanguageFn();

  const [state, setState] = useState({
    hotkeyDefinitions: initialHotkeyDefinitions,
    languageValue: currentLanguage.value,
    annotationFontSize: Number(localStorage.getItem('ohif-annotation-font-size')) || 14,
    annotationLineWidth: Number(localStorage.getItem('ohif-annotation-line-width')) || 2.5,
  });

  const onLanguageChangeHandler = (value: string) => {
    setState(state => ({ ...state, languageValue: value }));
  };

  const onHotkeyChangeHandler = (id: string, newKeys: string) => {
    setState(state => ({
      ...state,
      hotkeyDefinitions: {
        ...state.hotkeyDefinitions,
        [id]: {
          ...state.hotkeyDefinitions[id],
          keys: newKeys,
        },
      },
    }));
  };

  const onResetHandler = () => {
    setState(state => ({
      ...state,
      languageValue: defaultLanguage.value,
      hotkeyDefinitions: resolvedHotkeyDefaults,
      annotationFontSize: 14,
      annotationLineWidth: 2.5,
    }));

    hotkeysManager.restoreDefaultBindings();
  };

  const displayNames = React.useMemo(() => {
    if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
      return null;
    }

    const locales = [state.languageValue, currentLanguage.value, i18nextInstance.language, 'en'];
    const uniqueLocales = Array.from(new Set(locales.filter(Boolean)));

    try {
      return new Intl.DisplayNames(uniqueLocales, { type: 'language', fallback: 'none' });
    } catch (error) {
      console.warn('Intl.DisplayNames not supported for locales', uniqueLocales, error);
    }

    return null;
  }, [state.languageValue, currentLanguage.value, i18nextInstance.language]);

  const getLanguageLabel = React.useCallback(
    (languageValue: string, fallbackLabel: string) => {
      const translationKey = `LanguageName.${languageValue}`;
      if (i18nextInstance.exists(translationKey, { ns: 'UserPreferencesModal' })) {
        return t(translationKey);
      }

      if (displayNames) {
        try {
          const localized = displayNames.of(languageValue);
          if (localized && localized.toLowerCase() !== languageValue.toLowerCase()) {
            return localized.charAt(0).toUpperCase() + localized.slice(1);
          }
        } catch (error) {
          // Invalid language code, use fallback
          console.debug(`Unable to resolve display name for ${languageValue}`, error);
          return fallbackLabel;
        }
      }

      return fallbackLabel;
    },
    [displayNames, i18nextInstance, t]
  );

  return (
    <UserPreferencesModal>
      <UserPreferencesModal.Body>
        {/* Language Section */}
        <div className="mb-3 flex items-center space-x-14">
          <UserPreferencesModal.SubHeading>{t('Language')}</UserPreferencesModal.SubHeading>
          <Select
            defaultValue={state.languageValue}
            onValueChange={onLanguageChangeHandler}
          >
            <SelectTrigger
              className="w-60"
              aria-label="Language"
            >
              <SelectValue placeholder={t('Select language')} />
            </SelectTrigger>
            <SelectContent>
              {availableLanguages.map(lang => (
                <SelectItem
                  key={lang.value}
                  value={lang.value}
                >
                  {getLanguageLabel(lang.value, lang.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Annotation Settings Section */}
         <div className="mb-6 border-t border-secondary-light pt-4">
          <UserPreferencesModal.SubHeading className="mb-4 block">{t('Annotation Settings')}</UserPreferencesModal.SubHeading>
          <div className="flex gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-white text-sm">
                {t('Font Size')}
              </label>
              <Select
                value={String(state.annotationFontSize)}
                onValueChange={(value) => {
                  setState(prev => ({ ...prev, annotationFontSize: Number(value) }));
                }}
              >
                <SelectTrigger className="w-40">
                  {state.annotationFontSize}px
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {[...new Set([10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48, 60, state.annotationFontSize])]
                    .sort((a, b) => a - b)
                    .map(size => (
                      <SelectItem key={size} value={String(size)}>
                        {size}px
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-white text-sm">
                 {t('Line Style')}
              </label>
              <Select
                value={state.annotationLineWidth === 1.5 ? 'small' : state.annotationLineWidth === 2.5 ? 'medium' : 'large'}
                onValueChange={(value) => {
                  const widthMap = { small: 1.5, medium: 2.5, large: 3.5 };
                  setState(prev => ({ ...prev, annotationLineWidth: widthMap[value] }));
                }}
              >
                <SelectTrigger className="w-40">
                  {state.annotationLineWidth === 1.5 ? t('Small') : state.annotationLineWidth === 2.5 ? t('Medium') : t('Large')}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">{t('Small')}</SelectItem>
                  <SelectItem value="medium">{t('Medium')}</SelectItem>
                  <SelectItem value="large">{t('Large')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <UserPreferencesModal.SubHeading>{t('Hotkeys')}</UserPreferencesModal.SubHeading>
        <UserPreferencesModal.HotkeysGrid>
          {Object.entries(state.hotkeyDefinitions).map(([id, definition]) => (
            <UserPreferencesModal.Hotkey
              key={id}
              label={t(definition.label)}
              value={definition.keys}
              onChange={newKeys => onHotkeyChangeHandler(id, newKeys)}
              placeholder={definition.keys}
              hotkeys={hotkeysModule}
            />
          ))}
        </UserPreferencesModal.HotkeysGrid>
      </UserPreferencesModal.Body>
      <FooterAction>
        <FooterAction.Left>
          <FooterAction.Auxiliary onClick={onResetHandler}>
            {t('Reset to defaults')}
          </FooterAction.Auxiliary>
        </FooterAction.Left>
        <FooterAction.Right>
          <FooterAction.Secondary
            onClick={() => {
              hotkeysModule.stopRecord();
              hotkeysModule.unpause();
              hide();
            }}
          >
            {t('Cancel')}
          </FooterAction.Secondary>
          <FooterAction.Primary
            onClick={() => {
              if (state.languageValue !== currentLanguage.value) {
                i18n.changeLanguage(state.languageValue);
                // Save annotation settings before reload
                localStorage.setItem('ohif-annotation-font-size', String(state.annotationFontSize));
                localStorage.setItem('ohif-annotation-line-width', String(state.annotationLineWidth));
                window.dispatchEvent(new Event('annotation-settings-changed'));

                // Force page reload after language change to ensure all translations are applied
                window.location.reload();
                return; // Exit early since we're reloading
              }

              // Save annotation settings
              localStorage.setItem('ohif-annotation-font-size', String(state.annotationFontSize));
              localStorage.setItem('ohif-annotation-line-width', String(state.annotationLineWidth));
              window.dispatchEvent(new Event('annotation-settings-changed'));

              hotkeysManager.setHotkeys(state.hotkeyDefinitions);
              hotkeysModule.stopRecord();
              hotkeysModule.unpause();
              hide();
            }}
          >
            {t('Save')}
          </FooterAction.Primary>
        </FooterAction.Right>
      </FooterAction>
    </UserPreferencesModal>
  );
}

export default {
  'ohif.userPreferencesModal': UserPreferencesModalDefault,
};
