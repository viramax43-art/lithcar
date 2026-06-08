import type {
  DriverFormDriverField,
  DriverRegistrationFormField,
  DriverRegistrationFormSchema,
  UserInfoTextI18n,
} from '../types'
import { EMPTY_USER_INFO_TEXT } from './userInfoText'

export const PROFILE_PHOTO_FIELD_ID = 'driver_photo'

export interface ProfilePhotoEditorState {
  enabled: boolean
  required: boolean
  fieldId: string
  label: UserInfoTextI18n
  helpText: UserInfoTextI18n
}

export interface FormBuilderEditorState {
  introText: UserInfoTextI18n
  profilePhoto: ProfilePhotoEditorState
  fields: DriverRegistrationFormField[]
}

export type FieldPresetId =
  | 'customShortText'
  | 'customLongText'
  | 'customPhoto'
  | 'customDocument'
  | 'name'
  | 'carBrand'
  | 'carModel'
  | 'carPlate'
  | 'vehicleColor'
  | 'seatsCount'
  | 'licenseNumber'
  | 'about'

const DEFAULT_PROFILE_PHOTO_LABELS: UserInfoTextI18n = {
  lt: 'Profilio nuotrauka',
  pl: 'Zdjecie profilowe',
  en: 'Profile photo',
  ru: 'Фото профиля',
}

const PRESET_LABELS: Record<Exclude<FieldPresetId, 'customShortText' | 'customLongText' | 'customPhoto' | 'customDocument'>, UserInfoTextI18n> = {
  name: { lt: 'Vardas ir pavarde', pl: 'Imie i nazwisko', en: 'Full name', ru: 'ФИО' },
  carBrand: { lt: 'Automobilio marke', pl: 'Marka samochodu', en: 'Car brand', ru: 'Марка автомобиля' },
  carModel: { lt: 'Automobilio modelis', pl: 'Model samochodu', en: 'Car model', ru: 'Модель автомобиля' },
  carPlate: { lt: 'Valstybinis numeris', pl: 'Numer rejestracyjny', en: 'License plate', ru: 'Госномер' },
  vehicleColor: { lt: 'Spalva', pl: 'Kolor', en: 'Color', ru: 'Цвет' },
  seatsCount: { lt: 'Vietu skaicius', pl: 'Liczba miejsc', en: 'Seats', ru: 'Количество мест' },
  licenseNumber: { lt: 'Vairuotojo pazymejimas', pl: 'Prawo jazdy', en: 'License number', ru: 'Номер удостоверения' },
  about: { lt: 'Apie save', pl: 'O sobie', en: 'About you', ru: 'О себе' },
}

const PRESET_BINDINGS: Partial<Record<FieldPresetId, DriverFormDriverField>> = {
  name: 'name',
  carBrand: 'carBrand',
  carModel: 'carModel',
  carPlate: 'carPlate',
  vehicleColor: 'vehicleColor',
  seatsCount: 'seatsCount',
  licenseNumber: 'licenseNumber',
  about: 'about',
}

function makeFieldId(): string {
  return `field_${Date.now().toString(36)}`
}

function emptyI18n(): UserInfoTextI18n {
  return { ...EMPTY_USER_INFO_TEXT }
}

function findProfilePhotoField(schema: DriverRegistrationFormSchema): DriverRegistrationFormField | null {
  return (
    schema.fields.find((field) => field.driverField === 'photo') ??
    schema.fields.find((field) => field.id === PROFILE_PHOTO_FIELD_ID) ??
    null
  )
}

export function splitSchemaForEditor(schema: DriverRegistrationFormSchema): FormBuilderEditorState {
  const profileField = findProfilePhotoField(schema)
  const fields = schema.fields
    .filter((field) => field.driverField !== 'photo' && field.id !== PROFILE_PHOTO_FIELD_ID)
    .map((field) => ({ ...field }))

  return {
    introText: { ...schema.introText },
    profilePhoto: {
      enabled: profileField !== null,
      required: profileField?.required ?? false,
      fieldId: profileField?.id ?? PROFILE_PHOTO_FIELD_ID,
      label: profileField?.label ?? { ...DEFAULT_PROFILE_PHOTO_LABELS },
      helpText: profileField?.helpText ?? emptyI18n(),
    },
    fields,
  }
}

export function mergeEditorToSchema(editor: FormBuilderEditorState): DriverRegistrationFormSchema {
  const fields = editor.fields.map((field) => ({ ...field }))
  if (editor.profilePhoto.enabled) {
    const photoField: DriverRegistrationFormField = {
      id: editor.profilePhoto.fieldId || PROFILE_PHOTO_FIELD_ID,
      type: 'file',
      required: editor.profilePhoto.required,
      order: fields.length,
      label: editor.profilePhoto.label,
      placeholder: emptyI18n(),
      helpText: editor.profilePhoto.helpText,
      driverField: 'photo',
      accept: 'image/*',
    }
    fields.push(photoField)
  }

  fields.forEach((field, index) => {
    field.order = index
  })

  return {
    introText: editor.introText,
    fields,
  }
}

export function createFieldFromPreset(preset: FieldPresetId, order: number): DriverRegistrationFormField {
  const base = {
    id: makeFieldId(),
    required: false,
    order,
    placeholder: emptyI18n(),
    helpText: emptyI18n(),
    driverField: null as DriverFormDriverField | null,
  }

  if (preset === 'customShortText') {
    return {
      ...base,
      type: 'text',
      label: { ...emptyI18n(), en: 'Short text' },
    }
  }
  if (preset === 'customLongText') {
    return {
      ...base,
      type: 'textarea',
      label: { ...emptyI18n(), en: 'Long text' },
    }
  }
  if (preset === 'customPhoto') {
    return {
      ...base,
      type: 'file',
      accept: 'image/*',
      label: {
        lt: 'Nuotrauka',
        pl: 'Zdjecie',
        en: 'Photo',
        ru: 'Фото',
      },
    }
  }
  if (preset === 'customDocument') {
    return {
      ...base,
      type: 'file',
      accept: 'image/*,application/pdf',
      label: {
        lt: 'Dokumentas',
        pl: 'Dokument',
        en: 'Document',
        ru: 'Документ',
      },
    }
  }

  const binding = PRESET_BINDINGS[preset]
  return {
    ...base,
    type: preset === 'about' ? 'textarea' : 'text',
    required: preset === 'name' || preset === 'carBrand' || preset === 'carModel' || preset === 'carPlate',
    label: { ...PRESET_LABELS[preset] },
    driverField: binding ?? null,
  }
}

export function bindingAlreadyUsed(fields: DriverRegistrationFormField[], binding: DriverFormDriverField): boolean {
  return fields.some((field) => field.driverField === binding)
}

export function getAvailableProfilePresets(fields: DriverRegistrationFormField[]): FieldPresetId[] {
  const presets: FieldPresetId[] = ['customShortText', 'customLongText', 'customPhoto', 'customDocument']
  const profilePresets: FieldPresetId[] = ['name', 'carBrand', 'carModel', 'carPlate', 'vehicleColor', 'seatsCount', 'licenseNumber', 'about']
  for (const preset of profilePresets) {
    const binding = PRESET_BINDINGS[preset]
    if (binding && !bindingAlreadyUsed(fields, binding)) {
      presets.push(preset)
    }
  }
  return presets
}

export function fieldTypeLabelKey(field: DriverRegistrationFormField): string {
  if (field.type === 'textarea') return 'admin.driverFormBuilder.fieldType.longText'
  if (field.type === 'file') {
    if (field.driverField === 'photo') return 'admin.driverFormBuilder.fieldType.profilePhoto'
    if (field.accept?.includes('pdf')) return 'admin.driverFormBuilder.fieldType.document'
    return 'admin.driverFormBuilder.fieldType.photo'
  }
  return 'admin.driverFormBuilder.fieldType.shortText'
}
