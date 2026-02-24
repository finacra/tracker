/**
 * Qatar Validator
 */

import { GCCBaseValidator } from './gcc-base'
import type { CountryConfig } from '../index'

export class QatarValidator extends GCCBaseValidator {
  constructor(config: CountryConfig) {
    super(config, 'Qatar')
  }
}
