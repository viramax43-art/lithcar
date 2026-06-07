import { EMPTY_USER_INFO_TEXT } from './userInfoText'
import type { DriverRegistrationFormSchema } from '../types'

export const DEFAULT_DRIVER_REGISTRATION_FORM: DriverRegistrationFormSchema = {
  introText: { ...EMPTY_USER_INFO_TEXT },
  fields: [],
}
