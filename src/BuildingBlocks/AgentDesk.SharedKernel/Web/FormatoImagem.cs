namespace AgentDesk.SharedKernel.Web;

/// <summary>
/// Reconhece PNG, JPEG e WEBP pelo CONTEÚDO (magic bytes), nunca pelo nome ou pelo tipo informado pelo cliente.
/// SVG fica de fora de propósito: pode carregar script. Usado pela foto de perfil (Contas).
/// </summary>
public static class FormatoImagem
{
    public const int TamanhoMaximoBytes = 1024 * 1024;

    /// <summary>"image/png", "image/jpeg", "image/webp" ou null se não for uma imagem aceita.</summary>
    public static string? Detectar(ReadOnlySpan<byte> b)
    {
        if (b.Length >= 8 && b[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "image/png";
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length >= 12 && b[..4].SequenceEqual("RIFF"u8) && b.Slice(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}
