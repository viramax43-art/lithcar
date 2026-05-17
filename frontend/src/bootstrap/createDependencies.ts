import * as adminApi from '../infrastructure/api/adminApi'
import * as driverApi from '../infrastructure/api/driverApi'
import * as passengerApi from '../infrastructure/api/passengerApi'
import * as passengerAuthSession from '../infrastructure/auth/passengerAuthSession'

export interface AppDependencies {
  api: {
    admin: typeof adminApi
    driver: typeof driverApi
    passenger: typeof passengerApi
  }
  auth: typeof passengerAuthSession
}

export function createDependencies(): AppDependencies {
  return {
    api: {
      admin: adminApi,
      driver: driverApi,
      passenger: passengerApi,
    },
    auth: passengerAuthSession,
  }
}
