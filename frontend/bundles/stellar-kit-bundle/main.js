// main.js

// 1. Import the main class from the 'sdk' entry point
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk';

// 2. Import types and themes from the *main* entry point
import { 
  KitEventType, 
  SwkAppDarkTheme 
} from '@creit-tech/stellar-wallets-kit';

// 3. Import defaultModules from its specific '/modules/utils' path
import { 
  defaultModules 
} from '@creit-tech/stellar-wallets-kit/modules/utils';

// 4. Export them all for the UMD bundle
export {
  StellarWalletsKit,
  KitEventType,
  SwkAppDarkTheme,
  defaultModules
};