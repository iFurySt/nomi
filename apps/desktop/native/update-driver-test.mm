#import "update-driver.h"
#include <cassert>
#include <cmath>

// Exercise Sparkle's public callback contract without network/install or user data.
@interface FixtureItem : NSObject
@property(copy) NSString *displayVersionString;
@property(copy) NSString *versionString;
@property(getter=isInformationOnlyUpdate) BOOL informationOnlyUpdate;
@end
@implementation FixtureItem
@end
@interface FixtureState : NSObject
@property SPUUserUpdateStage stage;
@end
@implementation FixtureState
@end
int main() { @autoreleasepool {
  NomiUpdateDriver *driver = [NomiUpdateDriver new];
  assert([driver.phase isEqual:@"idle"] && ![driver install] && ![driver download]);
  FixtureItem *item = [FixtureItem new]; item.displayVersionString = @"0.2.0";
  FixtureState *state = [FixtureState new]; state.stage = SPUUserUpdateStageNotDownloaded;
  __block int installs = 0, cancels = 0, acknowledgements = 0;
  [driver showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:^(SPUUserUpdateChoice choice) {
    assert(choice == SPUUserUpdateChoiceInstall); installs++;
  }];
  assert([driver.phase isEqual:@"available"] && [driver.nextVersion isEqual:@"0.2.0"]);
  assert(installs == 0 && [driver download] && installs == 1 && ![driver download]);
  [driver showDownloadInitiatedWithCancellation:^{ cancels++; }];
  assert(driver.snapshot[@"progress"] == nil);
  [driver showDownloadDidReceiveExpectedContentLength:1000];
  [driver showDownloadDidReceiveDataOfLength:123]; [driver showDownloadDidReceiveDataOfLength:297];
  assert(fabs([driver.snapshot[@"progress"] doubleValue] - .42) < .001);
  assert([driver cancel] && cancels == 1 && ![driver cancel]);
  [driver showDownloadInitiatedWithCancellation:^{ cancels++; }];
  [driver showDownloadDidReceiveExpectedContentLength:1]; [driver showDownloadDidReceiveDataOfLength:2];
  assert([driver.snapshot[@"progress"] doubleValue] == 1);
  [driver showDownloadDidStartExtractingUpdate]; assert(![driver cancel]);
  [driver showExtractionReceivedProgress:.6]; [driver showExtractionReceivedProgress:NAN];
  assert([driver.snapshot[@"progress"] doubleValue] == .6);
  [driver showReadyToInstallAndRelaunch:^(SPUUserUpdateChoice choice) { assert(choice == SPUUserUpdateChoiceInstall); installs++; }];
  assert([driver.phase isEqual:@"ready"] && installs == 1); // Host must flush documents before continuing.
  assert([driver install] && installs == 2 && ![driver install]);
  __block int resumed = 0;
  assert([driver updater:(SPUUpdater *)[NSObject new] shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvokingBlock:^{ resumed++; }]);
  assert([driver.snapshot[@"pendingInstall"] boolValue] && resumed == 0);
  [driver resume]; [driver resume]; assert(resumed == 1);
  __block int retries = 0;
  [driver showInstallingUpdateWithApplicationTerminated:NO retryTerminatingApplication:^{ retries++; }];
  driver.terminationStarted = [NSDate dateWithTimeIntervalSinceNow:-9];
  assert([driver.snapshot[@"phase"] isEqual:@"ready"]);
  assert([driver install] && retries == 1);
  assert([driver.failure isEqual:@""]);
  [driver dismissUpdateInstallation]; assert(![driver.snapshot[@"pendingInstall"] boolValue]);
  NSError *failure = [NSError errorWithDomain:@"fixture" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Download failed"}];
  [driver showUpdaterError:failure acknowledgement:^{ acknowledgements++; }]; [driver dismissUpdateInstallation];
  assert([driver.phase isEqual:@"error"] && [driver.failure isEqual:@"Download failed"]);
  for (NSNumber *reason in @[@(SPUNoUpdateFoundReasonOnLatestVersion), @(SPUNoUpdateFoundReasonSystemIsTooOld)]) {
    NSError *error = [NSError errorWithDomain:@"fixture" code:1 userInfo:@{SPUNoUpdateFoundReasonKey:reason}];
    [driver showUpdateNotFoundWithError:error acknowledgement:^{ acknowledgements++; }];
    assert([driver.phase isEqual:[reason integerValue] == SPUNoUpdateFoundReasonOnLatestVersion ? @"up-to-date" : @"error"]);
  }
  assert(acknowledgements == 3);
  item.informationOnlyUpdate = YES;
  [driver showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:^(SPUUserUpdateChoice choice) { assert(choice == SPUUserUpdateChoiceDismiss); }];
  assert([driver.phase isEqual:@"error"] && ![driver download]);
  item.informationOnlyUpdate = NO; state.stage = SPUUserUpdateStageInstalling;
  [driver showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:^(SPUUserUpdateChoice choice) { installs++; }];
  assert([driver.phase isEqual:@"ready"] && ![driver download] && installs == 2);
  puts("Sparkle driver callbacks: PASS (progress, cancellation, one-shot replies, ready gate, retry, errors)");
} }
