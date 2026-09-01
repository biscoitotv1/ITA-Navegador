const RELEASE_API_URL =
  'https://api.github.com/repos/biscoitotv1/ITA-Navegador/releases/latest'

module.exports = async (request, response) => {
  try {
    const releaseResponse = await fetch(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ITA-Browser-Download'
      }
    })

    if (!releaseResponse.ok) {
      throw new Error(`GitHub release lookup failed: ${releaseResponse.status}`)
    }

    const release = await releaseResponse.json()
    const installer = release.assets.find((asset) =>
      /^ITA-Navegador-Setup-.*\.exe$/i.test(asset.name)
    )

    if (!installer) {
      response.status(404).send('Windows installer is not available in the latest release.')
      return
    }

    response.redirect(302, installer.browser_download_url)
  } catch (error) {
    console.error('[ITA Download] Unable to resolve latest Windows installer:', error)
    response.status(502).send('Unable to resolve the latest Windows installer.')
  }
}