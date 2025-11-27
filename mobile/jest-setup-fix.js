// Fix for jest-expo UIManager issue
// This file patches the jest-expo setup before it runs

const originalSetup = require('jest-expo/src/preset/setup');

// Ensure UIManager exists before jest-expo tries to use it
if (typeof jest !== 'undefined') {
  const mockNativeModules = require('react-native/Libraries/BatchedBridge/NativeModules').default;
  
  if (mockNativeModules && !mockNativeModules.UIManager) {
    mockNativeModules.UIManager = {
      getConstantsForViewManager: jest.fn(),
      hasConstantsForViewManager: jest.fn(),
      getViewManagerConfig: jest.fn(),
      createView: jest.fn(),
      updateView: jest.fn(),
      manageChildren: jest.fn(),
      setChildren: jest.fn(),
      replaceExistingNonRootView: jest.fn(),
      removeSubviewsFromContainerWithID: jest.fn(),
      measure: jest.fn(),
      measureInWindow: jest.fn(),
      measureLayout: jest.fn(),
      findSubviewIn: jest.fn(),
      dispatchViewManagerCommand: jest.fn(),
      sendAccessibilityEvent: jest.fn(),
      configureNextLayoutAnimation: jest.fn(),
      setJSResponder: jest.fn(),
      clearJSResponder: jest.fn(),
    };
  }
}



