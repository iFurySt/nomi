#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>

// Sparkle owns networking, signature validation, extraction and installation.
// The driver only holds one-shot UI replies and main-thread presentation state.
@interface NomiUpdateDriver : NSObject <SPUUserDriver, SPUUpdaterDelegate>
@property(copy) NSString *phase;
@property(copy) NSString *nextVersion;
@property(copy) NSString *failure;
@property uint64_t expectedBytes;
@property uint64_t receivedBytes;
@property double extractionProgress;
@property(strong) NSDate *terminationStarted;
@property(copy) void (^retryTermination)(void);
@property(copy) void (^choice)(SPUUserUpdateChoice);
@property(copy) void (^cancellation)(void);
@property(copy) void (^installHandler)(void);
- (BOOL)download;
- (BOOL)install;
- (BOOL)cancel;
- (void)resume;
- (NSDictionary *)snapshot;
@end
