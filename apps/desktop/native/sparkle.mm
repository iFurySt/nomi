#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>

// All exports and Sparkle delegate callbacks run on Electron's AppKit/main thread.
// JavaScript polls this gate and flushes all document windows before resuming.
@interface NomiUpdaterDelegate : NSObject <SPUUpdaterDelegate>
@property(copy) void (^installHandler)(void);
@end
@implementation NomiUpdaterDelegate
- (BOOL)updater:(SPUUpdater *)updater shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvokingBlock:(void (^)(void))handler {
  self.installHandler = handler;
  return YES;
}
@end
static SPUStandardUpdaterController *controller;
static NomiUpdaterDelegate *delegate;
static napi_value Undefined(napi_env env) {napi_value value; napi_get_undefined(env, &value); return value;}
static napi_value Start(napi_env env, napi_callback_info info) {
  if (![NSThread isMainThread]) {napi_throw_error(env, nullptr, "Sparkle requires the main thread");return nullptr;}
  if (!controller) {
    delegate = [NomiUpdaterDelegate new];
    controller = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:NO updaterDelegate:delegate userDriverDelegate:nil];
    NSError *error = nil;
    if (![controller.updater startUpdater:&error]) {
      controller = nil;
      napi_throw_error(env, nullptr, error.localizedDescription.UTF8String);
      return nullptr;
    }
  }
  return Undefined(env);
}
static napi_value Check(napi_env env, napi_callback_info info) {
  if (!controller || !controller.updater.canCheckForUpdates) {napi_throw_error(env, nullptr, "Update check is already running or unavailable");return nullptr;}
  [controller checkForUpdates:nil];
  return Undefined(env);
}
static napi_value State(napi_env env, napi_callback_info info) {
  napi_value result, value; napi_create_object(env,&result);
  napi_get_boolean(env, controller != nil && controller.updater.canCheckForUpdates, &value);napi_set_named_property(env,result,"canCheck",value);
  napi_get_boolean(env, delegate.installHandler != nil, &value);napi_set_named_property(env,result,"pendingInstall",value);
  napi_get_boolean(env, controller != nil && controller.updater.automaticallyChecksForUpdates, &value);napi_set_named_property(env,result,"automatic",value);
  return result;
}
static napi_value Automatic(napi_env env, napi_callback_info info) {
  size_t count=1; napi_value args[1]; napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  bool enabled; if(count != 1 || napi_get_value_bool(env,args[0],&enabled)!=napi_ok) {napi_throw_type_error(env,nullptr,"Expected boolean");return nullptr;}
  controller.updater.automaticallyChecksForUpdates=enabled;
  return Undefined(env);
}
static napi_value Resume(napi_env env, napi_callback_info info) {
  void (^handler)(void)=delegate.installHandler;
  delegate.installHandler=nil;
  if(handler) handler();
  return Undefined(env);
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"start",0,Start,0,0,0,napi_default,0}, {"check",0,Check,0,0,0,napi_default,0},
    {"state",0,State,0,0,0,napi_default,0}, {"resume",0,Resume,0,0,0,napi_default,0},
    {"automatic",0,Automatic,0,0,0,napi_default,0},
  };
  napi_define_properties(env,exports,5,properties);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
