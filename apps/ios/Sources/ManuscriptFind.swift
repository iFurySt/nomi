import SwiftUI

/// Find across the complete reading text, including notes rendered by multiple block editors.
struct ManuscriptFind: UIViewControllerRepresentable {
    let note: Manuscript

    func makeUIViewController(context: Context) -> Controller {
        let controller = Controller()
        let text = controller.textView
        text.text = note.shareText
        ManuscriptTypography.apply(to: text.textStorage, hasTitle: true, changed: nil, traits: text.traitCollection)
        return controller
    }

    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController {
        let textView = UITextView()

        override func loadView() {
            textView.isEditable = false
            textView.isFindInteractionEnabled = true
            textView.backgroundColor = .systemBackground
            textView.textContainerInset = UIEdgeInsets(top: 20, left: 20, bottom: 20, right: 20)
            textView.accessibilityIdentifier = "findManuscriptText"
            view = textView
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            textView.findInteraction?.presentFindNavigator(showingReplace: false)
        }
    }
}
