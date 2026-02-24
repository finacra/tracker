/**
 * Bahrain Validator
 */

import { GCCBaseValidator } from './gcc-base'
import type { CountryConfig } from '../index'

export class BahrainValidator extends GCCBaseValidator {
  constructor(config: CountryConfig) {
    super(config, 'Bahrain')
  }
}
