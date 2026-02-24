/**
 * Oman Validator
 */

import { GCCBaseValidator } from './gcc-base'
import type { CountryConfig } from '../index'

export class OmanValidator extends GCCBaseValidator {
  constructor(config: CountryConfig) {
    super(config, 'Oman')
  }
}
