// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "NomiMac",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "NomiMac", targets: ["NomiMac"])
    ],
    targets: [
        .executableTarget(
            name: "NomiMac",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
